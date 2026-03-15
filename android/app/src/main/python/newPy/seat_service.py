"""
座椅控制系统 HTTP API 服务

基于 FastAPI 封装 IntegratedSeatSystem，提供 RESTful API 和 WebSocket 接口。
支持 Node.js 等任意语言通过 HTTP 或 WebSocket 调用。

启动方式:
    python seat_service.py
    # 或
    uvicorn seat_service:app --host 0.0.0.0 --port 8000

API 文档:
    启动后访问 http://localhost:8000/docs

WebSocket:
    ws://localhost:8000/ws
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, List, Optional
import numpy as np
import json
from integrated_system import IntegratedSeatSystem


def convert_numpy_types(obj):
    """
    递归转换 numpy 类型为 Python 原生类型
    解决 FastAPI JSON 序列化问题
    """
    if isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.bool_,)):
        return bool(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.str_):
        return str(obj)
    else:
        return obj

# ========== FastAPI 应用 ==========
app = FastAPI(
    title="座椅控制服务",
    description="IntegratedSeatSystem HTTP API 封装",
    version="1.0.0"
)

# 允许跨域访问（方便 Node.js 调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== 全局系统实例 ==========
system = IntegratedSeatSystem('sensor_config.yaml')


# ========== 请求模型 ==========
class FrameRequest(BaseModel):
    """处理帧请求"""
    sensor_data: List[int]  # 144个元素的传感器数据


class SetParamRequest(BaseModel):
    """设置系统参数请求"""
    key: str
    value: Any


class ConfigValueRequest(BaseModel):
    """设置配置值请求"""
    value: Any


# ========== 核心 API ==========
@app.post("/process_frame")
async def process_frame(request: FrameRequest):
    """
    处理单帧传感器数据

    - **sensor_data**: 144个整数的数组（0-255）
    - 返回完整的处理结果，包括控制指令、状态、检测结果等
    """
    if len(request.sensor_data) != 144:
        raise HTTPException(
            status_code=400,
            detail=f"数据长度必须为144，当前: {len(request.sensor_data)}"
        )

    data = np.array(request.sensor_data, dtype=np.uint8)
    result = system.process_frame(data)
    return convert_numpy_types(result)


@app.post("/reset")
async def reset_system():
    """
    重置系统状态

    清空所有状态机、队列、计数器，回到初始状态
    """
    system.reset()
    return {"status": "ok", "message": "系统已重置"}


@app.get("/status")
async def get_status():
    """
    获取当前系统状态

    返回最近一次 process_frame 的完整结果
    """
    result = system.get_latest_result()
    if result is None:
        return {"status": "no_data", "message": "尚未处理任何帧"}
    return convert_numpy_types(result)


@app.post("/set_param")
async def set_param(request: SetParamRequest):
    """
    修改系统参数

    - **key**: 参数名（如 cushion_sum_threshold）
    - **value**: 新值
    """
    try:
        system.set_param(request.key, request.value)
        return {"status": "ok", "key": request.key, "value": request.value}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ========== 配置管理 API ==========
@app.get("/config")
async def get_all_config():
    """获取所有配置"""
    return system.config.get_all()


@app.get("/config/all_with_comments")
async def get_all_config_with_comments():
    """获取所有配置及其注释（扁平化格式）"""
    return system.config.get_all_with_comments()


@app.get("/config/comment/{key_path:path}")
async def get_config_comment(key_path: str):
    """
    获取指定配置的注释

    - **key_path**: 配置路径，如 integrated_system.cushion_sum_threshold
    """
    comment = system.config.get_comment(key_path)
    return {"key": key_path, "comment": comment}


@app.get("/config/{key_path:path}")
async def get_config(key_path: str):
    """
    获取指定配置值

    - **key_path**: 配置路径，如 lumbar.back_total_threshold
    """
    value = system.config.get(key_path)
    if value is None:
        raise HTTPException(status_code=404, detail=f"配置不存在: {key_path}")
    return {"key": key_path, "value": value}


@app.put("/config/{key_path:path}")
async def set_config(key_path: str, request: ConfigValueRequest):
    """
    设置指定配置值

    - **key_path**: 配置路径
    - **value**: 新值
    """
    system.config.set(key_path, request.value)
    return {"status": "ok", "key": key_path, "value": request.value}


@app.post("/config/reset")
async def reset_config():
    """重置配置到初始状态（不保存到文件）"""
    system.config.reset()
    return {"status": "ok", "message": "配置已重置到初始状态"}


@app.post("/config/reload")
async def reload_config():
    """从文件重新加载配置"""
    system.config.reload()
    return {"status": "ok", "message": "配置已从文件重新加载"}


@app.post("/config/save")
async def save_config():
    """保存当前配置到文件"""
    try:
        system.config.save_to_file()
        return {"status": "ok", "message": "配置已保存到文件"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 体型三分类 API ==========
@app.post("/body_shape/trigger")
async def trigger_body_shape():
    """
    触发体型三分类识别

    调用后系统开始采集传感器数据，采集完成后自动进行体型分类。
    采集时间约 2.3 秒（13Hz × 30帧）。
    通过 GET /body_shape/status 查询进度和结果。
    """
    result = system.trigger_body_shape_classification()
    return convert_numpy_types(result)


@app.get("/body_shape/status")
async def get_body_shape_status():
    """
    获取体型三分类器的当前状态

    返回分类器状态（IDLE/COLLECTING/COMPLETED）、采集进度、分类结果等。
    """
    result = system.get_body_shape_status()
    return convert_numpy_types(result)


@app.get("/body_shape/result")
async def get_body_shape_result():
    """
    获取体型三分类的最新结果

    返回分类结果：体型（瘦小/中等/高大）、置信度、概率分布。
    如果尚未完成分类，返回 null。
    """
    result = system.get_body_shape_result()
    if result is None:
        return {"status": "no_result", "message": "尚未完成体型分类，请先触发 POST /body_shape/trigger"}
    return convert_numpy_types(result)


# ========== 健康检查 ==========
@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {
        "status": "healthy",
        "service": "seat-control",
        "frame_count": system.frame_count,
        "state": system.state.name
    }


# ========== WebSocket 接口 ==========
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket 接口 - 低延迟实时通信

    消息格式 (JSON):

    核心操作:
    - {"action": "process_frame", "sensor_data": [50, 50, ...]} -> {完整result}
    - {"action": "reset"} -> {"status": "ok"}
    - {"action": "status"} -> {最新结果}
    - {"action": "set_param", "key": "xxx", "value": yyy} -> {"status": "ok"}
    - {"action": "health"} -> {健康状态}

    配置管理:
    - {"action": "config_get_all"} -> {完整配置}
    - {"action": "config_get", "key": "lumbar.threshold"} -> {"value": xxx}
    - {"action": "config_set", "key": "lumbar.threshold", "value": 25} -> {"status": "ok"}
    - {"action": "config_reset"} -> {"status": "ok"}
    - {"action": "config_reload"} -> {"status": "ok"}
    - {"action": "config_save"} -> {"status": "ok"}
    - {"action": "config_get_all_with_comments"} -> {配置及注释}
    - {"action": "config_get_comment", "key": "xxx"} -> {"comment": "..."}
    """
    await websocket.accept()
    print(f"[WebSocket] 客户端已连接")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            action = msg.get("action", "process_frame")

            try:
                # ===== 核心操作 =====
                if action == "process_frame":
                    sensor_data = msg.get("sensor_data", [])
                    if len(sensor_data) != 144:
                        await websocket.send_json({"error": f"数据长度必须为144，当前: {len(sensor_data)}"})
                        continue
                    np_data = np.array(sensor_data, dtype=np.uint8)
                    result = system.process_frame(np_data)
                    await websocket.send_json(convert_numpy_types(result))

                elif action == "reset":
                    system.reset()
                    await websocket.send_json({"status": "ok", "message": "系统已重置"})

                elif action == "status":
                    result = system.get_latest_result()
                    if result is None:
                        await websocket.send_json({"status": "no_data"})
                    else:
                        await websocket.send_json(convert_numpy_types(result))

                elif action == "set_param":
                    key = msg.get("key")
                    value = msg.get("value")
                    system.set_param(key, value)
                    await websocket.send_json({"status": "ok", "key": key, "value": value})

                elif action == "health":
                    await websocket.send_json({
                        "status": "healthy",
                        "frame_count": system.frame_count,
                        "state": system.state.name
                    })

                # ===== 配置管理 =====
                elif action == "config_get_all":
                    await websocket.send_json(system.config.get_all())

                elif action == "config_get":
                    key = msg.get("key")
                    value = system.config.get(key)
                    await websocket.send_json({"key": key, "value": value})

                elif action == "config_set":
                    key = msg.get("key")
                    value = msg.get("value")
                    system.config.set(key, value)
                    await websocket.send_json({"status": "ok", "key": key, "value": value})

                elif action == "config_reset":
                    system.config.reset()
                    await websocket.send_json({"status": "ok", "message": "配置已重置"})

                elif action == "config_reload":
                    system.config.reload()
                    await websocket.send_json({"status": "ok", "message": "配置已重新加载"})

                elif action == "config_save":
                    system.config.save_to_file()
                    await websocket.send_json({"status": "ok", "message": "配置已保存"})

                elif action == "config_get_all_with_comments":
                    await websocket.send_json(system.config.get_all_with_comments())

                elif action == "config_get_comment":
                    key = msg.get("key")
                    comment = system.config.get_comment(key)
                    await websocket.send_json({"key": key, "comment": comment})

                # ===== 体型三分类 =====
                elif action == "trigger_body_shape":
                    result = system.trigger_body_shape_classification()
                    await websocket.send_json(convert_numpy_types(result))

                elif action == "body_shape_status":
                    result = system.get_body_shape_status()
                    await websocket.send_json(convert_numpy_types(result))

                elif action == "body_shape_result":
                    result = system.get_body_shape_result()
                    if result is None:
                        await websocket.send_json({"status": "no_result"})
                    else:
                        await websocket.send_json(convert_numpy_types(result))

                else:
                    await websocket.send_json({"error": f"未知动作: {action}"})

            except Exception as e:
                await websocket.send_json({"error": str(e)})

    except WebSocketDisconnect:
        print(f"[WebSocket] 客户端已断开")
    except Exception as e:
        print(f"[WebSocket] 错误: {e}")


# ========== 启动入口 ==========
if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("座椅控制服务启动中...")
    print("API 文档: http://localhost:8000/docs")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
