import numpy as np
from typing import Dict, Union, Tuple, Optional, Any

class JointSmoother:
    """
    Class to smooth joint coordinate positions and scalar angles using Exponential Moving Average.
    """
    def __init__(self, alpha: float = 0.7) -> None:
        """
        Initializes the JointSmoother with a default alpha smoothing coefficient.
        """
        self.alpha: float = alpha
        self._history: Dict[str, np.ndarray] = {}
        self._scalar_history: Dict[str, float] = {}

    def smooth(self, key: str, value: np.ndarray) -> np.ndarray:
        """
        Applies Exponential Moving Average smoothing on numpy coordinates:
        smoothed = alpha * previous + (1 - alpha) * current
        """
        if key not in self._history:
            self._history[key] = value.copy()
            return value.copy()
        
        smoothed = self.alpha * self._history[key] + (1.0 - self.alpha) * value
        self._history[key] = smoothed.copy()
        return smoothed

    def smooth_scalar(self, key: str, value: float) -> float:
        """
        Applies Exponential Moving Average smoothing on scalar float values:
        smoothed = alpha * previous + (1 - alpha) * current
        """
        if key not in self._scalar_history:
            self._scalar_history[key] = value
            return value
        
        smoothed = self.alpha * self._scalar_history[key] + (1.0 - self.alpha) * value
        self._scalar_history[key] = float(smoothed)
        return float(smoothed)


class PoseProcessor:
    """
    Processes raw pose landmarks, handles mirroring, smoothing, avatar normalization, 
    and joint angle extraction.
    """
    # MediaPipe landmark indices
    IDX: Dict[str, int] = {
        'nose': 0,
        'left_shoulder': 11,
        'right_shoulder': 12,
        'left_elbow': 13,
        'right_elbow': 14,
        'left_wrist': 15,
        'right_wrist': 16,
        'left_hip': 23,
        'right_hip': 24,
        'left_knee': 25,
        'right_knee': 26,
        'left_ankle': 27,
        'right_ankle': 28
    }

    # Mirror pairs to swap left/right after X coordinate flip
    MIRROR_PAIRS: Tuple[Tuple[int, int], ...] = (
        (11, 12),  # (left_shoulder, right_shoulder)
        (13, 14),  # (left_elbow, right_elbow)
        (15, 16),  # (left_wrist, right_wrist)
        (23, 24),  # (left_hip, right_hip)
        (25, 26),  # (left_knee, right_knee)
        (27, 28)   # (left_ankle, right_ankle)
    )

    # Anatomical constraints LIMITS dict [min, max degrees]
    LIMITS: Dict[str, Tuple[float, float]] = {
        'left_elbow_bend': (0.0, 160.0),
        'right_elbow_bend': (0.0, 160.0),
        'left_shoulder_elevation': (-20.0, 180.0),
        'right_shoulder_elevation': (-20.0, 180.0),
        'left_shoulder_horizontal': (-60.0, 180.0),
        'right_shoulder_horizontal': (-180.0, 60.0),
        'left_shoulder_twist': (-90.0, 90.0),
        'right_shoulder_twist': (-90.0, 90.0),
        'left_wrist_flex': (-80.0, 80.0),
        'right_wrist_flex': (-80.0, 80.0)
    }

    def __init__(self, alpha: float = 0.7, mirror: bool = True, avatar_shoulder_width: float = 0.38) -> None:
        """
        Initializes PoseProcessor with smoothing factors and avatar scale parameters.
        """
        self.alpha: float = alpha
        self.mirror: bool = mirror
        self.avatar_shoulder_width: float = avatar_shoulder_width
        
        # Instantiate coordinate and angle smoothers
        self._pos_smoother: JointSmoother = JointSmoother(alpha=alpha)
        self._angle_smoother: JointSmoother = JointSmoother(alpha=alpha)

    def _angle3(self, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
        """
        Calculates angle at vertex b between rays b->a and b->c in degrees.
        Uses dot product and arccos.
        """
        ba = a - b
        bc = c - b
        denom = np.linalg.norm(ba) * np.linalg.norm(bc)
        if denom < 1e-5:
            return 0.0
        cos_theta = np.dot(ba, bc) / denom
        cos_theta = np.clip(cos_theta, -1.0, 1.0)
        return float(np.degrees(np.arccos(cos_theta)))

    def process(self, raw_landmarks: Any) -> Dict[str, Any]:
        """
        Main method that processes raw pose landmarks and outputs smoothed normalized positions and joint angles.
        
        Steps implemented:
        1. MIRROR FIX: Flips coordinates along X-axis and swaps left/right pose parts.
        2. SMOOTH POSITIONS: Runs Exponential Moving Average on raw coordinates.
        3. NORMALIZE TO AVATAR SCALE: Rescales based on shoulder width and aligns hip center to origin.
        4. CALCULATE JOINT ANGLES: Calculates elevation, horizontal angle, and bend for shoulders/elbows.
        5. CLAMP ANGLES: Bounds angles within realistic human limit intervals.
        6. SMOOTH ANGLES: Runs Exponential Moving Average on the extracted angles.
        """
        # Parse inputs (MediaPipe Landmark List or raw numpy array)
        if not isinstance(raw_landmarks, np.ndarray):
            lm = np.zeros((33, 3), dtype=np.float32)
            for i, l in enumerate(raw_landmarks.landmark):
                lm[i] = [l.x, l.y, l.z]
        else:
            lm = raw_landmarks.copy()

        # STEP 1 - MIRROR FIX:
        if self.mirror:
            lm[:, 0] = 1.0 - lm[:, 0]
            for left, right in self.MIRROR_PAIRS:
                lm[[left, right]] = lm[[right, left]]

        # STEP 2 - SMOOTH POSITIONS:
        for i in range(len(lm)):
            lm[i] = self._pos_smoother.smooth(f'p{i}', lm[i])

        # STEP 3 - NORMALIZE TO AVATAR SCALE:
        l_shoulder = lm[self.IDX['left_shoulder']]
        r_shoulder = lm[self.IDX['right_shoulder']]
        shoulder_dist = np.linalg.norm(l_shoulder - r_shoulder)
        if shoulder_dist < 1e-5:
            shoulder_dist = 1e-5
            
        scale = self.avatar_shoulder_width / shoulder_dist
        
        l_hip = lm[self.IDX['left_hip']]
        r_hip = lm[self.IDX['right_hip']]
        center = (l_hip + r_hip) / 2.0
        
        # Shift and scale coordinates
        lm = (lm - center) * scale

        # Get landmarks for angle calculation
        l_hip = lm[self.IDX['left_hip']]
        r_hip = lm[self.IDX['right_hip']]
        l_sh = lm[self.IDX['left_shoulder']]
        r_sh = lm[self.IDX['right_shoulder']]
        l_el = lm[self.IDX['left_elbow']]
        r_el = lm[self.IDX['right_elbow']]
        l_wr = lm[self.IDX['left_wrist']]
        r_wr = lm[self.IDX['right_wrist']]

        # STEP 4 - CALCULATE JOINT ANGLES:
        # Left Arm Calculations
        left_shoulder_elevation = self._angle3(l_hip, l_sh, l_el)
        sh2el_l = l_el - l_sh
        left_shoulder_horizontal = float(np.degrees(np.arctan2(sh2el_l[2], sh2el_l[0])))
        left_shoulder_twist = 0.0
        left_elbow_bend = self._angle3(l_sh, l_el, l_wr)
        left_wrist_flex = 0.0

        # Right Arm Calculations
        right_shoulder_elevation = self._angle3(r_hip, r_sh, r_el)
        sh2el_r = r_el - r_sh
        right_shoulder_horizontal = float(np.degrees(np.arctan2(sh2el_r[2], sh2el_r[0])))
        right_shoulder_twist = 0.0
        right_elbow_bend = self._angle3(r_sh, r_el, r_wr)
        right_wrist_flex = 0.0

        raw_angles = {
            'left_shoulder_elevation': left_shoulder_elevation,
            'left_shoulder_horizontal': left_shoulder_horizontal,
            'left_shoulder_twist': left_shoulder_twist,
            'left_elbow_bend': left_elbow_bend,
            'left_wrist_flex': left_wrist_flex,
            'right_shoulder_elevation': right_shoulder_elevation,
            'right_shoulder_horizontal': right_shoulder_horizontal,
            'right_shoulder_twist': right_shoulder_twist,
            'right_elbow_bend': right_elbow_bend,
            'right_wrist_flex': right_wrist_flex
        }

        # STEPS 5 & 6 - CLAMP + SMOOTH ANGLES:
        smoothed_angles = {}
        for name, val in raw_angles.items():
            limits = self.LIMITS[name]
            clamped = np.clip(val, limits[0], limits[1])
            smoothed_angles[name] = self._angle_smoother.smooth_scalar(name, float(clamped))

        # Format output
        landmarks_output = {}
        for name, idx in self.IDX.items():
            landmarks_output[name] = {
                'x': float(lm[idx][0]),
                'y': float(lm[idx][1]),
                'z': float(lm[idx][2])
            }

        return {
            'landmarks': landmarks_output,
            'angles': smoothed_angles
        }
