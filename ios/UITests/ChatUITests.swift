import XCTest
final class ChatUITests: XCTestCase {
    func testNativeConversationAndReadyReplyDoNotSendUntilExplicitTap() {
        let app = XCUIApplication(); app.launchArguments = ["--ui-fixture"]; app.launch()
        let store = app.buttons["store-fixture-store"]; XCTAssertTrue(store.waitForExistence(timeout: 15)); store.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "composer").firstMatch.waitForExistence(timeout: 15)); XCTAssertTrue(app.staticTexts["Δοκιμή εμφάνισης συνομιλίας"].exists)
        app.buttons["Έτοιμες"].tap(); let reply = app.buttons["Το ελέγχω και θα απαντήσω."]; XCTAssertTrue(reply.waitForExistence(timeout: 5)); reply.tap()
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "composer").firstMatch.value as? String, "Το ελέγχω και θα απαντήσω.")
        let header = app.staticTexts["title"]
        XCTAssertGreaterThanOrEqual(header.frame.minY, app.frame.minY, "Ready-reply draft must not push the header outside the phone")
        XCTAssertLessThanOrEqual(app.descendants(matching: .any).matching(identifier: "composer").firstMatch.frame.maxY, app.frame.maxY)
        let proof = XCTAttachment(screenshot: app.screenshot()); proof.name = "native-conversation-normal"; proof.lifetime = .keepAlways; add(proof)
        app.buttons["Αποστολή μηνύματος"].tap(); XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "composer").firstMatch.waitForExistence(timeout: 5)); XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "composer").firstMatch.value as? String, "")
    }
    func testBackgroundClearsDraftOnRealApplicationLifecycle() {
        let app = XCUIApplication(); app.launchArguments = ["--ui-fixture"]; app.launch(); let store = app.buttons["store-fixture-store"]; XCTAssertTrue(store.waitForExistence(timeout: 15)); store.tap()
        let field = app.descendants(matching: .any).matching(identifier: "composer").firstMatch; XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("synthetic private draft")
        XCUIDevice.shared.press(.home); app.activate(); XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertNotEqual(field.value as? String, "synthetic private draft")
    }
    func testLargeFontPhoneKeepsNativeToolsReachable() {
        let app = XCUIApplication(); app.launchArguments = ["--ui-fixture", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryXXXL"]; app.launch(); let store = app.buttons["store-fixture-store"]; XCTAssertTrue(store.waitForExistence(timeout: 15)); store.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "composer").firstMatch.waitForExistence(timeout: 10)); for title in ["Έτοιμες", "Φωνητικό", "Βίντεο"] { XCTAssertTrue(app.buttons[title].isHittable, title) }
        let proof = XCTAttachment(screenshot: app.screenshot()); proof.name = "native-conversation-large-font"; proof.lifetime = .keepAlways; add(proof)
    }
}
