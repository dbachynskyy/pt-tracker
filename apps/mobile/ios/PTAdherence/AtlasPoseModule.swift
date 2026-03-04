import Foundation
import AVFoundation
import Vision
import UIKit

@objc(AtlasPoseModule)
class AtlasPoseModule: NSObject {
  private let queue = DispatchQueue(label: "atlas.pose.module", qos: .userInitiated)

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(isAvailable:rejecter:)
  func isAvailable(resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    let hasVision = NSClassFromString("VNDetectHumanBodyPoseRequest") != nil
    let auth = AVCaptureDevice.authorizationStatus(for: .video)
    if auth == .denied || auth == .restricted {
      reject("CAMERA_DENIED", "Camera permission denied", nil)
      return
    }
    resolve(hasVision)
  }

  @objc(estimatePose:resolver:rejecter:)
  func estimatePose(_ input: NSDictionary,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      guard UIApplication.shared.applicationState == .active else {
        reject("SESSION_INTERRUPTED", "Application inactive / session interrupted", nil)
        return
      }

      let auth = AVCaptureDevice.authorizationStatus(for: .video)
      if auth == .denied || auth == .restricted {
        reject("CAMERA_DENIED", "Camera permission denied", nil)
        return
      }

      guard let base64 = input["base64"] as? String,
            let width = input["width"] as? NSNumber,
            let height = input["height"] as? NSNumber,
            let timestampMs = input["timestampMs"] as? NSNumber else {
        reject("BAD_PAYLOAD_SHAPE", "Missing required frame fields", nil)
        return
      }

      guard let data = Data(base64Encoded: base64),
            let image = UIImage(data: data),
            let cgImage = image.cgImage else {
        reject("BAD_PAYLOAD_SHAPE", "Invalid image payload", nil)
        return
      }

      let request = VNDetectHumanBodyPoseRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

      do {
        try handler.perform([request])
      } catch {
        reject("SESSION_INTERRUPTED", "Vision request failed: \(error.localizedDescription)", error)
        return
      }

      guard let obs = request.results?.first else {
        resolve([
          "confidence": 0,
          "landmarks": []
        ])
        return
      }

      do {
        let points = try obs.recognizedPoints(.all)
        var landmarks: [[String: Any]] = []

        for (joint, point) in points {
          guard point.confidence > 0 else { continue }
          guard let mapped = Self.mapJoint(joint) else { continue }

          landmarks.append([
            "index": mapped.index,
            "name": mapped.name,
            "x": Double(point.x),
            "y": Double(1.0 - point.y),
            "visibility": Double(point.confidence)
          ])
        }

        let payload: [String: Any] = [
          "confidence": Double(obs.confidence),
          "landmarks": landmarks,
          "width": width.doubleValue,
          "height": height.doubleValue,
          "timestampMs": timestampMs.doubleValue
        ]
        resolve(payload)
      } catch {
        reject("BAD_LANDMARKS", "Could not read body landmarks", error)
      }
    }
  }

  private static func mapJoint(_ joint: VNHumanBodyPoseObservation.JointName) -> (index: Int, name: String)? {
    switch joint {
    case .nose: return (0, "nose")
    case .leftShoulder: return (11, "left_shoulder")
    case .rightShoulder: return (12, "right_shoulder")
    case .leftElbow: return (13, "left_elbow")
    case .rightElbow: return (14, "right_elbow")
    case .leftWrist: return (15, "left_wrist")
    case .rightWrist: return (16, "right_wrist")
    case .leftHip: return (23, "left_hip")
    case .rightHip: return (24, "right_hip")
    case .leftKnee: return (25, "left_knee")
    case .rightKnee: return (26, "right_knee")
    case .leftAnkle: return (27, "left_ankle")
    case .rightAnkle: return (28, "right_ankle")
    default: return nil
    }
  }
}
