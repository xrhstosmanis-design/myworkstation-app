# Workforce attendance QR fast camera — 04/10/2026

USER clarified final attendance flow: POS operator attendance follows shift open→IN and shift close→OUT; coworkers use «Κάρτα εργασίας» inside the operator's POS and scan their own QR/PIN without opening another POS session. Current server inspection confirms this backend already exists: attendance-card/scan and attendance-pin/submit toggle Workforce IN/OUT; shift open/close call syncOperatorWorkforceAttendance with IN/OUT; audit records WORKFORCE_CLOCK_IN/OUT and scanner/verifier operator; OUT within one minute of IN is blocked.

This change is UI/camera-only for coworker attendance. Reuse the physically-proven fast QR configuration from POS card login: QR_CODE + CODE_128 ZXing (preserving existing printed/scanner cards), 60ms attempts, preferred 1280×720, continuous focus where supported, and a square target frame. Existing attendance endpoints, toggle semantics, one-minute duplicate guard, shift logic, POS sessions, transactions and fiscal behavior are unchanged.

Status: BACKEND FLOW CONFIRMED BY CODE / FAST ATTENDANCE CAMERA IMPLEMENTED / AWAITING CI + DEPLOY + CONTROLLED LAB IN TEST. Do not claim attendance physical PASS until a fresh scan and Workforce evidence are observed.

CI #4331 regression finding: existing security suite requires camera Code 128 attendance scanning. Initial QR-only optimization correctly failed that guard. Fix preserves both QR_CODE and CODE_128 while retaining the faster cadence/resolution/focus/targeting improvements. No backend change.
