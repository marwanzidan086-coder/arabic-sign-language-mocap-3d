import asyncio
import json
import os
import cv2
import mediapipe as mp
import websockets
from typing import Dict, Any, Optional
from pose_processor import PoseProcessor
from sign_detector import SignDetector

class SignLanguageServer:
    """
    Main WebSocket server that captures webcam video, processes pose tracking via MediaPipe,
    detects sign language gestures, and broadcasts pose/animation parameters to connected client web apps.
    """
    def __init__(self) -> None:
        """
        Initializes the Server, loading the PoseProcessor, SignDetector, and MediaPipe Pose model configuration.
        """
        print("[Server] Initializing Sign Language Recognition Server...")
        self.processor: PoseProcessor = PoseProcessor(
            alpha=0.7, 
            mirror=True, 
            avatar_shoulder_width=0.38
        )
        
        # Calculate dynamic absolute path to animations folder
        base_dir = os.path.dirname(os.path.abspath(__file__))
        animations_dir = os.path.join(base_dir, "../animations")
        self.detector: SignDetector = SignDetector(animations_dir=animations_dir)
        
        # Initialize MediaPipe Pose tracking solution
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            model_complexity=1,
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        print("[Server] MediaPipe Pose models and SignDetector loaded successfully.")

    async def handle(self, websocket: websockets.WebSocketServerProtocol) -> None:
        """
        WebSocket handler callback that manages webcam capture and stream loop for each client connection.
        
        Steps implemented:
        1. Open webcam device using OpenCV.
        2. Convert raw BGR frames to RGB.
        3. Execute MediaPipe pose detection.
        4. Calculate angles and check sign triggers.
        5. Tick animation frames if active.
        6. Stream JSON payload to the frontend.
        """
        client_address = websocket.remote_address
        print(f"[Server] Client connected from {client_address}")
        
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[Server] ERROR: Could not open webcam (VideoCapture 0). Check camera connection.")
            # Send error payload before closing
            await websocket.send(json.dumps({
                'type': 'error',
                'message': 'Webcam not accessible on server host machine.'
            }, ensure_ascii=False))
            return

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("[Server] Failed to read webcam frame.")
                    await asyncio.sleep(0.01)
                    continue
                
                # Convert BGR to RGB for MediaPipe
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self.pose.process(rgb_frame)
                
                payload: Dict[str, Any] = {}
                
                if results.pose_landmarks:
                    # STEP 4: Process pose and extract angles
                    pose_data = self.processor.process(results.pose_landmarks)
                    
                    # Check for sign gestures using buffered angles
                    detected_sign = self.detector.update(pose_data)
                    
                    # Tick animation player if playing pre-recorded animation
                    anim_frame = self.detector.player.tick()
                    
                    payload = {
                        'type': 'frame',
                        'pose': pose_data,
                        'detected_sign': detected_sign,
                        'sign_word': self.detector.player.sign_word if self.detector.player.active else None,
                        'animating': self.detector.player.active,
                        'anim_frame': anim_frame
                    }
                else:
                    # In case of no visible person/pose landmarks
                    payload = {
                        'type': 'frame',
                        'pose': None,
                        'detected_sign': None,
                        'sign_word': None,
                        'animating': False,
                        'anim_frame': None
                    }
                
                # Send frame data as a JSON string
                await websocket.send(json.dumps(payload, ensure_ascii=False))
                
                # Maintain ~30 FPS rate
                await asyncio.sleep(1 / 30)
                
        except websockets.exceptions.ConnectionClosedOK:
            print(f"[Server] Connection closed normally by client {client_address}")
        except websockets.exceptions.ConnectionClosedError:
            print(f"[Server] Connection closed with error by client {client_address}")
        except Exception as e:
            print(f"[Server] Unexpected error in connection loop: {e}")
        finally:
            cap.release()
            print(f"[Server] Webcam released. Client session ended for {client_address}")

    async def run(self, host: str = '0.0.0.0', port: int = 8765) -> None:
        """
        Starts the WebSocket server listening on the specified host and port.
        """
        print(f"[Server] Starting WebSocket Server on ws://{host}:{port}")
        async with websockets.serve(self.handle, host, port):
            # Run forever
            await asyncio.Future()


if __name__ == '__main__':
    server = SignLanguageServer()
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("[Server] Server stopped by keyboard interrupt.")
