/**
 * Node.js 调用示例 - WebSocket 版本
 * 启动 Python 服务并以 13Hz 频率推送数据
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');

// 配置
const WS_URL = 'ws://localhost:8000/ws';
const API_URL = 'http://localhost:8000';
const FPS = 13;
const FRAME_INTERVAL = 1000 / FPS; // ~77ms
const RUN_DURATION = 10; // 运行10秒
const TOTAL_FRAMES = FPS * RUN_DURATION;

// 生成全为50的假数据 (144个元素)
const sensorData = Array(144).fill(50);

// 启动 Python 服务
function startPythonService() {
    return new Promise((resolve, reject) => {
        console.log('正在启动 Python 服务...');

        const pythonProcess = spawn('python', ['-u', 'seat_service.py'], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        pythonProcess.stdout.setEncoding('utf8');
        pythonProcess.stderr.setEncoding('utf8');

        pythonProcess.stdout.on('data', (data) => {
            console.log(`[Python] ${data.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const msg = data;
            if (msg.includes('Application startup complete') || msg.includes('Uvicorn running')) {
                console.log('[Python] 服务已启动');
                resolve(pythonProcess);
            }
            if (!msg.includes('INFO:')) {
                console.log(`[Python] ${msg.trim()}`);
            }
        });

        pythonProcess.on('error', (err) => {
            reject(new Error(`启动 Python 服务失败: ${err.message}`));
        });

        setTimeout(() => resolve(pythonProcess), 5000);
    });
}

// 等待服务就绪
async function waitForService(maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${API_URL}/health`);
            if (response.ok) {
                console.log('HTTP 服务已就绪');
                return true;
            }
        } catch (e) { }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('服务启动超时');
}

// WebSocket 连接
function connectWebSocket() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
            console.log('WebSocket 已连接');
            resolve(ws);
        });

        ws.on('error', (err) => {
            reject(new Error(`WebSocket 连接失败: ${err.message}`));
        });

        setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
    });
}

// 主循环 - WebSocket 版本
async function runTest(pythonProcess, ws) {
    console.log('=' .repeat(60));
    console.log(`开始测试 (WebSocket): ${FPS} FPS, 共 ${TOTAL_FRAMES} 帧`);
    console.log('=' .repeat(60));

    const startTime = Date.now();
    let successCount = 0;
    let frame = 0;
    const latencies = [];

    return new Promise((resolve) => {
        ws.on('message', (data) => {
            const receiveTime = Date.now();
            const result = JSON.parse(data.toString());

            if (result.error) {
                console.error(`错误: ${result.error}`);
                return;
            }

            successCount++;
            const latency = receiveTime - sendTimes[frame];
            latencies.push(latency);

            // 每10帧打印一次
            if (frame % 1 === 0 || frame === TOTAL_FRAMES) {
                console.log(`\n--- 帧 ${frame} (延迟: ${latency}ms) ---`);
                console.log(`  座椅状态: ${result.seat_state}`);
                console.log(`  活体状态: ${result.living_status}`);
                console.log(`  体型: ${result.body_type}`);
                if (result.control_command) {
                    console.log(`  控制指令: 有`);
                }
            }

            // 检查是否完成
            if (frame >= TOTAL_FRAMES) {
                const totalTime = (Date.now() - startTime) / 1000;
                const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

                console.log('\n' + '=' .repeat(60));
                console.log(`测试完成: 实际耗时 ${totalTime.toFixed(2)}秒`);
                console.log(`成功帧数: ${successCount}/${TOTAL_FRAMES}`);
                console.log(`实际帧率: ${(TOTAL_FRAMES / totalTime).toFixed(1)} FPS`);
                console.log(`平均延迟: ${avgLatency.toFixed(2)} ms`);
                console.log(`最小延迟: ${Math.min(...latencies).toFixed(2)} ms`);
                console.log(`最大延迟: ${Math.max(...latencies).toFixed(2)} ms`);
                console.log('=' .repeat(60));

                resolve();
            }
        });

        // 记录发送时间
        const sendTimes = {};

        // 定时发送帧
        const interval = setInterval(() => {
            frame++;
            if (frame > TOTAL_FRAMES) {
                clearInterval(interval);
                return;
            }

            sendTimes[frame] = Date.now();
            ws.send(JSON.stringify({
                action: 'process_frame',
                sensor_data: sensorData
            }));
        }, FRAME_INTERVAL);
    });
}

// 主函数
async function main() {
    let pythonProcess = null;
    let ws = null;

    try {
        // 1. 启动 Python 服务
        pythonProcess = await startPythonService();

        // 2. 等待 HTTP 服务就绪
        await waitForService();

        // 3. 连接 WebSocket
        ws = await connectWebSocket();

        // 4. 运行测试
        await runTest(pythonProcess, ws);

        // 5. 清理
        console.log('\n正在关闭...');
        ws.close();
        pythonProcess.kill();
        process.exit(0);

    } catch (error) {
        console.error('错误:', error.message);
        if (ws) ws.close();
        if (pythonProcess) pythonProcess.kill();
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n收到中断信号，正在退出...');
    process.exit(0);
});

main();
