// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "MWSChatCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "MWSChatCore", targets: ["MWSChatCore"])], targets: [.target(name: "MWSChatCore", path: "Core"), .testTarget(name: "MWSChatCoreTests", dependencies: ["MWSChatCore"], path: "CoreTests")])
