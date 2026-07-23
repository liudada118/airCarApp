# -*- coding: utf-8 -*-
"""把小可的固定话术转成 MP3(微软在线中文女声 晓晓)。
用法: python gen_mp3.py
"""
import asyncio
import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"   # 晓晓:温柔年轻女声
RATE = "-8%"                      # 语速略放慢一点,更从容(可调 +/-%)

CLIPS = {
    "seat_welcome":
        "你好呀～我是您的健康姿态管家小可,很高兴陪您开启这段旅程。"
        "气囊自适应调节已开启,我会根据您的坐姿变化,自动调整至更适合您的状态。",
    "massage_on":
        "注意到您已经驾驶了一段时间,长时间保持坐姿可能会带来疲劳。"
        "小可已为您开启舒适调节,自动开启座椅支撑与按摩功能。"
        "路途再忙,也别忘了适时停下来休息,平安到达就是最好的旅程。",
    "spine_protect":
        "小可注意到您的坐姿重心有所偏移,已悄悄调整侧翼支撑,"
        "让座椅更贴合您的身体,提升乘坐舒适感。",
    "bump_relief":
        "注意到当前路况有些颠簸,小可已经帮您增强座椅侧翼支撑,提升乘坐稳定性。"
        "建议开启越野模式,小可陪您一起应对复杂路况。",
    "motion_sickness":
        "感受到当前路况变化,可能会带来晕车的不适感。"
        "建议保持头部稳定、看看窗外远方。"
        "小可建议您调低空调温度,并播放舒缓音乐,希望陪您轻松度过这段路程～",
}


async def one(name: str, text: str):
    out = f"{name}.mp3"
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(out)
    print(f"  OK  {out}")


async def main():
    print(f"voice={VOICE} rate={RATE}")
    for name, text in CLIPS.items():
        await one(name, text)
    print("done.")


if __name__ == "__main__":
    asyncio.run(main())
