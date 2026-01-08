"""
Test script: feed a constant matrix of 50s into the algorithm at a fixed FPS.
"""

import os
import time

import numpy as np
from integrated_system import IntegratedSeatSystem

def runTestConstantInput():
    result = main()
    return result

def main():
    config_path = os.path.join(os.path.dirname(__file__), 'sensor_config.yaml')
    system = IntegratedSeatSystem(config_path)

    # Create sensor data matrix (1 x 144) with all values = 50
    sensor_data = np.full((1, 144), 50, dtype=np.uint8)
    return sensor_data
    # Frame rate config
    fps = 13
    frame_interval = 1.0 / fps

    # Run duration (seconds)
    run_duration = 5
    total_frames = fps * run_duration

    print("=" * 60)
    print(f"Input: constant matrix, shape={sensor_data.shape}")
    print(f"FPS: {fps}, frame interval {frame_interval * 1000:.1f}ms")
    print(f"Planned run: {run_duration}s, total frames {total_frames}")
    print("=" * 60)

    start_time = time.time()

    for _frame in range(1, total_frames + 1):
        frame_start = time.time()

        result = system.process_frame(sensor_data)

        print(f"\n--- frame {result['frame_count']} ---")

        if result['control_command']:
            print(f"  Control command: {result['control_command']}")
        else:
            print("  Control command: none")

        # FPS control
        elapsed = time.time() - frame_start
        sleep_time = frame_interval - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    total_time = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"Finished: {total_time:.2f}s, total frames {total_frames}")
    print(f"Actual FPS: {total_frames / total_time:.1f}")
 

# if __name__ == '__main__':
#     main()
