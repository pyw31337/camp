// Apple Vision 글자 인식·장면 분류(맥미니 야간 작업, 2026-10-23). 무료·오프라인(Neural Engine).
// 컴파일: swiftc -O vision-ocr.swift -o ~/.letscamp/bin/vision-ocr   (install.sh가 한다)
// 사용:  vision-ocr --ocr 그림.png        → {"rows":["오토캠핑  평일  40,000원", ...]}
//        vision-ocr --classify 그림.jpg   → {"rows":[...], "labels":[{"id":"storefront","c":0.71}, ...]}
// rows: 같은 높이의 글 덩어리를 왼쪽부터 두 칸 띄어 이은 줄(표의 칸 구분, pipeline/lib/ocr.mjs가 칸으로 나눈다).
import Foundation
import ImageIO
import Vision

func loadImage(_ path: String) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func emit(_ obj: [String: Any]) {
  let data = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{}".utf8)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

let args = CommandLine.arguments
guard args.count >= 3, let image = loadImage(args[2]) else {
  FileHandle.standardError.write(Data("usage: vision-ocr --ocr|--classify <image>\n".utf8))
  exit(1)
}
let classify = args[1] == "--classify"
let handler = VNImageRequestHandler(cgImage: image, options: [:])

let text = VNRecognizeTextRequest()
text.recognitionLevel = .accurate
text.usesLanguageCorrection = true
if #available(macOS 13.0, *) {
  text.revision = VNRecognizeTextRequestRevision3
  text.recognitionLanguages = ["ko-KR", "en-US"]
}
var requests: [VNRequest] = [text]
let scene = VNClassifyImageRequest()
if classify { requests.append(scene) }

do { try handler.perform(requests) } catch {
  FileHandle.standardError.write(Data("vision failed: \(error)\n".utf8))
  exit(1)
}

// 글 덩어리 → 줄. Vision 좌표는 왼쪽 아래가 원점(0~1). 위에서 아래로, 같은 줄은 왼쪽에서 오른쪽으로.
let items: [(String, CGRect)] = (text.results ?? []).compactMap { o in
  guard let best = o.topCandidates(1).first else { return nil }
  return (best.string, o.boundingBox)
}
let heights = items.map { $0.1.height }.sorted()
let tol = (heights.isEmpty ? 0.02 : heights[heights.count / 2]) * 0.6
var rows: [[(String, CGRect)]] = []
for it in items.sorted(by: { $0.1.midY > $1.1.midY }) {
  if let ref = rows.last?.first, abs(ref.1.midY - it.1.midY) < tol {
    rows[rows.count - 1].append(it)
  } else {
    rows.append([it])
  }
}
let lines = rows.map { $0.sorted(by: { $0.1.minX < $1.1.minX }).map { $0.0 }.joined(separator: "  ") }

var out: [String: Any] = ["rows": lines]
if classify {
  out["labels"] = (scene.results ?? []).filter { $0.confidence > 0.1 }.prefix(12).map { ["id": $0.identifier, "c": Double($0.confidence)] }
}
emit(out)
