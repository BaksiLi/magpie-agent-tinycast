import AppKit
import Foundation

enum BridgeFailure: Error {
    case message(String)
}

#if TESTING
let domain = ProcessInfo.processInfo.environment["TINYCAST_TEST_DOMAIN"]!
precondition(domain.hasPrefix("dev.magpie.tinycast.test."))
#else
let domain = "com.abueammar.tinycast"
#endif

func running() -> Bool {
    #if TESTING
    return false
    #else
    NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == domain }
    #endif
}

func installed() -> Bool {
    #if TESTING
    return true
    #else
    return NSWorkspace.shared.urlForApplication(withBundleIdentifier: domain) != nil
    #endif
}

func preference(_ key: String) -> Any? {
    CFPreferencesCopyAppValue(key as CFString, domain as CFString)
}

func snapshot() throws -> [String: Any] {
    let stored = preference("aiConnections")
    var connections: [[String: Any]] = []
    if let stored {
        guard let data = stored as? Data,
              let decoded = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              decoded.allSatisfy({ $0["id"] is String }) else {
            throw BridgeFailure.message("Tinycast's stored connection format is unsupported; no settings were changed.")
        }
        connections = decoded
    }
    let selected = preference("aiDefaultModel")
    if selected != nil && !(selected is Data) {
        throw BridgeFailure.message("Tinycast's stored default model format is unsupported.")
    }
    return ["connections": connections, "connectionsPresent": stored != nil,
            "defaultRaw": (selected as? Data)?.base64EncodedString() as Any? ?? NSNull(),
            "running": running()]
}

func execute(_ request: [String: Any]) throws -> [String: Any] {
    let current = try snapshot()
    if request["action"] as? String == "read" { return current }
    guard request["action"] as? String == "write", let expected = request["expected"] as? [String: Any] else {
        throw BridgeFailure.message("Unsupported helper command.")
    }
    if running() { return ["status": "waiting_for_tinycast_to_quit"] }
    guard NSDictionary(dictionary: current).isEqual(to: expected) else {
        throw BridgeFailure.message("Tinycast settings changed during synchronization; retry.")
    }
    let remove = request["remove"] as? Bool == true
    if !remove && !installed() {
        throw BridgeFailure.message("Tinycast must be installed before connecting.")
    }
    if running() { return ["status": "waiting_for_tinycast_to_quit"] }
    guard NSDictionary(dictionary: try snapshot()).isEqual(to: expected) else {
        throw BridgeFailure.message("Tinycast settings changed before the write; retry.")
    }
    let connections: Data?
    if request["connections"] is NSNull { connections = nil }
    else if let value = request["connections"] as? [[String: Any]] {
        connections = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    } else { throw BridgeFailure.message("Invalid connection list.") }
    let selected: Data?
    if request["defaultRaw"] is NSNull { selected = nil }
    else if let value = request["defaultRaw"] as? String, let data = Data(base64Encoded: value) { selected = data }
    else { throw BridgeFailure.message("Invalid default model.") }
    CFPreferencesSetAppValue("aiConnections" as CFString, connections as CFData?, domain as CFString)
    CFPreferencesSetAppValue("aiDefaultModel" as CFString, selected as CFData?, domain as CFString)
    guard CFPreferencesAppSynchronize(domain as CFString) else {
        throw BridgeFailure.message("Tinycast preferences could not be saved; keep state.json and retry.")
    }
    return ["status": "applied"]
}

do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard let request = try JSONSerialization.jsonObject(with: input) as? [String: Any] else {
        throw BridgeFailure.message("Expected one JSON command on stdin.")
    }
    let result: [String: Any]
    do { result = try execute(request) }
    catch BridgeFailure.message(let message) { result = ["error": message] }
    catch { result = ["error": "The settings helper could not complete its operation."] }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
} catch {
    FileHandle.standardOutput.write(Data("{\"error\":\"Invalid helper input.\"}".utf8))
}
