import time
import os
import json
import numpy as np
from typing import Dict, List, Any, Optional

class AnimationPlayer:
    """
    Handles playback and linear interpolation of pre-recorded keyframe animations.
    """
    def __init__(self, fps: int = 30) -> None:
        """
        Initializes the AnimationPlayer with the specified frame rate (default 30).
        """
        self.fps: int = fps
        self.active: bool = False
        self.sign_word: str = ""
        self.frames: List[Dict[str, Any]] = []
        self._start_time: float = 0.0

    def play(self, animation_dict: Dict[str, Any]) -> None:
        """
        Loads keyframes and starts playing the animation from the current timestamp.
        """
        self.frames = animation_dict.get("frames", [])
        self.sign_word = animation_dict.get("arabic_word", "")
        self._start_time = time.time()
        self.active = len(self.frames) > 0
        print(f"[SignDetector] Playing animation '{animation_dict.get('name', 'unknown')}' for word '{self.sign_word}'")

    def tick(self) -> Optional[Dict[str, Dict[str, float]]]:
        """
        Ticks the animation player, interpolates bone coordinates for the elapsed time, 
        and returns the current frame bone rotations. Returns None when inactive or finished.
        """
        if not self.active or not self.frames:
            return None
        
        elapsed = time.time() - self._start_time
        raw_idx = elapsed * self.fps
        i = int(raw_idx)
        t = raw_idx - i  # fractional part for interpolation
        
        # Check if animation is finished
        if i >= len(self.frames) - 1:
            self.active = False
            print("[SignDetector] Animation finished playing")
            return None
            
        frame_a = self.frames[i]["bones"]
        frame_b = self.frames[i+1]["bones"]
        
        # Perform linear interpolation between frame i and frame i + 1
        interpolated: Dict[str, Dict[str, float]] = {}
        for bone in frame_a.keys():
            if bone in frame_b:
                a_rot = frame_a[bone]
                b_rot = frame_b[bone]
                interpolated[bone] = {
                    "x": float(a_rot["x"] + t * (b_rot["x"] - a_rot["x"])),
                    "y": float(a_rot["y"] + t * (b_rot["y"] - a_rot["y"])),
                    "z": float(a_rot["z"] + t * (b_rot["z"] - a_rot["z"]))
                }
            else:
                interpolated[bone] = frame_a[bone].copy()
                
        return interpolated


class SignDetector:
    """
    Buffers recent pose tracking data and evaluates geometric rules to detect signs in real time.
    """
    BUFFER_SIZE: int = 20
    COOLDOWN: float = 2.5

    def __init__(self, animations_dir: str = "animations") -> None:
        """
        Initializes the SignDetector, creates the AnimationPlayer instance, and preloads available animations.
        """
        self.animations_dir: str = animations_dir
        self.player: AnimationPlayer = AnimationPlayer(fps=30)
        self._animations: Dict[str, Dict[str, Any]] = {}
        self.buffer: List[Dict[str, Any]] = []
        self.last_detect_time: float = 0.0
        self._load_animations()

    def _load_animations(self) -> None:
        """
        Reads all .json file definitions from animations directory and loads them into self._animations.
        """
        if not os.path.exists(self.animations_dir):
            print(f"[SignDetector] Animations directory '{self.animations_dir}' not found.")
            return
            
        for filename in os.listdir(self.animations_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.animations_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        name = data.get("name", filename.replace(".json", ""))
                        self._animations[name] = data
                        print(f"[SignDetector] Loaded animation '{name}' from {filename}")
                except Exception as e:
                    print(f"[SignDetector] Failed to load animation from {filename}: {e}")

    def update(self, pose_data: Optional[Dict[str, Any]]) -> Optional[str]:
        """
        Buffers the latest pose tracking frame, evaluates detection rules, 
        and plays the matching animation if a gesture triggers.
        """
        if pose_data is None or 'angles' not in pose_data or 'landmarks' not in pose_data:
            return None

        # Append latest pose_data to buffer
        self.buffer.append(pose_data)
        if len(self.buffer) > self.BUFFER_SIZE:
            self.buffer.pop(0)

        # Skip detection if animation is already playing
        if self.player.active:
            return None

        # Skip detection if in cooldown period
        if time.time() - self.last_detect_time < self.COOLDOWN:
            return None

        # Need at least 10 frames to evaluate rules
        if len(self.buffer) < 10:
            return None

        # Evaluate sign gesture detection rules
        if self._detect_hello(self.buffer):
            sign_name = "hello"
            self.last_detect_time = time.time()
            self._trigger(sign_name)
            return sign_name

        if self._detect_yes(self.buffer):
            sign_name = "yes"
            self.last_detect_time = time.time()
            self._trigger(sign_name)
            return sign_name

        if self._detect_no(self.buffer):
            sign_name = "no"
            self.last_detect_time = time.time()
            self._trigger(sign_name)
            return sign_name

        return None

    def _trigger(self, sign_name: str) -> None:
        """
        Plays the animation for the given sign name if it exists in the preloaded animations.
        """
        if sign_name in self._animations:
            self.player.play(self._animations[sign_name])
        else:
            print(f"[SignDetector] Detected sign '{sign_name}' but no corresponding animation file is loaded.")

    def _detect_hello(self, buffer: List[Dict[str, Any]]) -> bool:
        """
        Rule: right_shoulder_elevation > 120° for at least 8 of the last 10 frames.
        """
        last_10 = buffer[-10:]
        count = 0
        for frame in last_10:
            elevation = frame["angles"].get("right_shoulder_elevation", 0.0)
            if elevation > 120.0:
                count += 1
        return count >= 8

    def _detect_yes(self, buffer: List[Dict[str, Any]]) -> bool:
        """
        Rule: right_wrist Y coordinate oscillation with at least 3 direction reversals.
        """
        last_10 = buffer[-10:]
        y_vals = []
        for frame in last_10:
            wrist = frame["landmarks"].get("right_wrist")
            if wrist:
                y_vals.append(wrist["y"])
        
        if len(y_vals) < 5:
            return False

        # Calculate differences and count sign changes (reversals)
        diffs = [y_vals[i+1] - y_vals[i] for i in range(len(y_vals)-1)]
        signs = [np.sign(d) for d in diffs if abs(d) > 0.005]  # ignore noise
        
        reversals = 0
        for i in range(1, len(signs)):
            if signs[i] != signs[i-1] and signs[i] != 0 and signs[i-1] != 0:
                reversals += 1
                
        return reversals >= 3

    def _detect_no(self, buffer: List[Dict[str, Any]]) -> bool:
        """
        Rule: right_wrist X coordinate oscillation with at least 3 direction reversals.
        """
        last_10 = buffer[-10:]
        x_vals = []
        for frame in last_10:
            wrist = frame["landmarks"].get("right_wrist")
            if wrist:
                x_vals.append(wrist["x"])
                
        if len(x_vals) < 5:
            return False

        # Calculate differences and count sign changes (reversals)
        diffs = [x_vals[i+1] - x_vals[i] for i in range(len(x_vals)-1)]
        signs = [np.sign(d) for d in diffs if abs(d) > 0.005]  # ignore noise
        
        reversals = 0
        for i in range(1, len(signs)):
            if signs[i] != signs[i-1] and signs[i] != 0 and signs[i-1] != 0:
                reversals += 1
                
        return reversals >= 3
