# Authoritative scoped result

07/10/2026 20:23-20:24 Europe/Athens - No16 LIMITED LAB PASS continuation as signed Super Admin cms1k1bje001xhn3xulr0rooz, ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ/storecmtpopbgo000trhb5ng9ytiru. Same N16-LAB-20261007-A/messagechat-1791392960195-p5hevl1gnw/taskchat-task-1791393082635-c4vy05z23ea; no resend/task recreation. Unpin true->false17:23:22.953765Z/audit6->7; unmark important true->false17:23:51.703976Z/audit7->8; message completed false->true17:24:17.526Z with actor/time/audit8->9; message reopen true->false17:24:39.937256Z cleared actor/time/audit9->10. UI verified each final label, completed actor/time and reopen. Linked task stayed OPEN throughout; messages50/tasks3/open1/controlstore0 unchanged. Fresh SQL BEFORE recorded before each click; all22financialgroups/2open shifts matched per action. Financial paymentMethod filtered sumsNULL preserved asNULL; no stock/SKU claim. Post-test healthc0f1b7f6edca675a37e7d4c7b5b5b45aea929d67; exact pre-action revision NOT CAPTURED (docs-only PR1839 merged between batches). New paths scoped PASS; previous pin/important/task-management PASS preserved. Overall16 OPEN for responsible assignment, OWNER/operator/tenant negative roles, logout/multipledevices and actual background Push/sound/correctterminal. Claimowner codex/n16-chat-acceptance-20261007 retained;17/other owners/#27 fixtures untouched. Checkpoint2026-10-07-n16-chat-message-controls.md; evidenceCHECKPOINTS/EVIDENCE/2026-10-07-n16-chat-message-controls.jpg. Previous publicationPR1839/CI4615/mergec0f1b7; current PR/CI/merge recorded in associated publication.

# No16 continuation 07Oct20:23 Athens

Existing signed Super Admin cms1k1bje001xhn3xulr0rooz; LAB cmtpopbgo000trhb5ng9ytiru. Only unpin/unmark/message complete/reopen on existing N16-LAB-20261007-A, no resend/task recreation. Initial before: pinnedtrue/importanttrue/completedfalse, message50/task3/open1/audit6,22 financial groups/2open shifts/control0. No SKU/stock scope. Full per-action snapshots follow.

## BEFORE unpin
```json
[
  {
    "audit": [
      {
        "action": "STORE_CHAT_MESSAGE_SENT",
        "actorUserId": "cms1k1bje001xhn3xulr0rooz",
        "afterJson": {
          "attachmentChecksum": null,
          "attachmentMimeType": null,
          "attachmentName": null,
          "attachmentSize": null,
          "category": "ANNOUNCEMENT",
          "hasAttachment": false,
          "messageId": "chat-1791392960195-p5hevl1gnw"
        },
        "createdAt": "2026-10-07T17:09:20.201",
        "entityId": "chat-1791392960195-p5hevl1gnw",
        "id": "chat-1791392960199-xeobx6b2c8a"
      },
      {
        "action": "STORE_CHAT_ANNOUNCEMENT_PINNED",
        "actorUserId": "cms1k1bje001xhn3xulr0rooz",
        "afterJson": {
          "messageId": "chat-1791392960195-p5hevl1gnw",
          "pinned": true
        },
        "createdAt": "2026-10-07T17:10:35.256",
        "entityId": "chat-1791392960195-p5hevl1gnw",
        "id": "chat-1791393035255-qglb7i3atxs"
      },
      {
        "action": "STORE_CHAT_MESSAGE_MARKED_IMPORTANT",
        "actorUserId": "cms1k1bje001xhn3xulr0rooz",
        "afterJson": {
          "important": true,
          "messageId": "chat-1791392960195-p5hevl1gnw"
        },
        "createdAt": "2026-10-07T17:10:57.811",
        "entityId": "chat-1791392960195-p5hevl1gnw",
        "id": "chat-1791393057810-2jrcs3xhoeu"
      },
      {
        "action": "STORE_CHAT_TASK_CREATED",
        "actorUserId": "cms1k1bje001xhn3xulr0rooz",
        "afterJson": {
          "messageId": "chat-1791392960195-p5hevl1gnw",
          "status": "OPEN",
          "taskId": "chat-task-1791393082635-c4vy05z23ea",
          "title": "N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."
        },
        "createdAt": "2026-10-07T17:11:22.707",
        "entityId": "chat-1791392960195-p5hevl1gnw",
        "id": "chat-1791393082705-dg67jtbv1ju"
      },
      {
        "action": "STORE_CHAT_TASK_COMPLETED",
        "actorUserId": "cms1k1bje001xhn3xulr0rooz",
        "afterJson": {
          "messageId": "chat-1791392960195-p5hevl1gnw",
          "status": "COMPLETED",
          "taskId": "chat-task-1791393082635-c4vy05z23ea"
        },
        "createdAt": "2026-10-07T17:11:53.587",
        "entityId": "chat-1791392960195-p5hevl1gnw",
        "id": "chat-1791393113586-tfmqjf7lza"
      },
      {
        "action": "STORE_CHAT_TASK_REOPENED",
        "actorUserId": "cms1k1bje001xhn3xulr0rooz",
        "afterJson": {
          "messageId": "chat-1791392960195-p5hevl1gnw",
          "status": "OPEN",
          "taskId": "chat-task-1791393082635-c4vy05z23ea"
        },
        "createdAt": "2026-10-07T17:12:17.686",
        "entityId": "chat-1791392960195-p5hevl1gnw",
        "id": "chat-1791393137684-im9ua7iz3lq"
      }
    ],
    "control_messages": 0,
    "financial": [
      {
        "card": null,
        "cash": null,
        "count": 6,
        "iris": null,
        "latest": "2026-09-19T21:03:16.010653+00:00",
        "sessionId": "0dc8e497-4975-43db-a180-68e3a7e001ca",
        "total": 9
      },
      {
        "card": null,
        "cash": null,
        "count": 6,
        "iris": null,
        "latest": "2026-09-08T11:09:45.609238+00:00",
        "sessionId": "127e3512-e7ef-4bf9-9df0-a3e93b7a59a4",
        "total": 4.7
      },
      {
        "card": null,
        "cash": null,
        "count": 6,
        "iris": null,
        "latest": "2026-09-17T17:48:28.836701+00:00",
        "sessionId": "1c3d9103-f42e-4583-aa65-5a71f6aeb6b0",
        "total": 4.1
      },
      {
        "card": null,
        "cash": null,
        "count": 10,
        "iris": null,
        "latest": "2026-09-16T19:11:43.162637+00:00",
        "sessionId": "1ec9982e-a525-476d-b9e3-581ff07b3945",
        "total": 9.3
      },
      {
        "card": null,
        "cash": null,
        "count": 1,
        "iris": null,
        "latest": "2026-09-14T17:12:43.502226+00:00",
        "sessionId": "2c2b6997-52dc-4fba-8654-5d810bf76a3d",
        "total": 50.69
      },
      {
        "card": null,
        "cash": null,
        "count": 1,
        "iris": null,
        "latest": "2026-09-25T10:15:08.417935+00:00",
        "sessionId": "3d894e2f-c467-4293-9f57-4553c653601d",
        "total": 0.7
      },
      {
        "card": null,
        "cash": null,
        "count": 2,
        "iris": null,
        "latest": "2026-10-01T09:51:17.723124+00:00",
        "sessionId": "4d7cf5a7-5042-4cd8-9529-81afcda278a6",
        "total": 2.4
      },
      {
        "card": null,
        "cash": null,
        "count": 1,
        "iris": null,
        "latest": "2026-09-26T13:12:21.410915+00:00",
        "sessionId": "66fb2dce-5e4d-44c2-b6cf-d05e495fba5d",
        "total": 0.5
      },
      {
        "card": null,
        "cash": null,
        "count": 3,
        "iris": null,
        "latest": "2026-09-10T09:17:45.311797+00:00",
        "sessionId": "695ec96e-9a72-4977-a705-d5cf3756951e",
        "total": 3
      },
      {
        "card": null,
        "cash": null,
        "count": 2,
        "iris": null,
        "latest": "2026-09-24T17:57:42.93496+00:00",
        "sessionId": "6d682e12-1a17-44c6-bb7b-64762c741643",
        "total": 1
      },
      {
        "card": null,
        "cash": null,
        "count": 19,
        "iris": null,
        "latest": "2026-09-25T12:28:13.631631+00:00",
        "sessionId": "74dfafb0-415a-4129-a87d-8a286eb2e94b",
        "total": 56.22
      },
      {
        "card": null,
        "cash": null,
        "count": 2,
        "iris": null,
        "latest": "2026-09-23T11:30:49.426789+00:00",
        "sessionId": "7f430556-5629-4a84-a9db-f48b27af3dae",
        "total": 0
      },
      {
        "card": null,
        "cash": null,
        "count": 1,
        "iris": null,
        "latest": "2026-09-15T06:21:34.032747+00:00",
        "sessionId": "9bb5b452-5a46-4b10-8b97-cce24c5c7e2c",
        "total": 76.58
      },
      {
        "card": null,
        "cash": null,
        "count": 4,
        "iris": null,
        "latest": "2026-09-24T11:50:28.931885+00:00",
        "sessionId": "9eb71340-941f-4c3f-a7be-d9368d6b47c0",
        "total": 0.5
      },
      {
        "card": null,
        "cash": null,
        "count": 3,
        "iris": null,
        "latest": "2026-09-24T11:02:27.503284+00:00",
        "sessionId": "af1b7fd4-830c-4163-92f2-d7b1e356bc56",
        "total": 0.5
      },
      {
        "card": null,
        "cash": null,
        "count": 2,
        "iris": null,
        "latest": "2026-09-27T16:42:24.611936+00:00",
        "sessionId": "b39ef41a-1d1a-4887-ac88-50ce92903773",
        "total": 6
      },
      {
        "card": null,
        "cash": null,
        "count": 1,
        "iris": null,
        "latest": "2026-09-24T07:47:26.714059+00:00",
        "sessionId": "b9a931e5-054e-4df9-8195-e781fe13c30d",
        "total": 0.5
      },
      {
        "card": null,
        "cash": null,
        "count": 4,
        "iris": null,
        "latest": "2026-09-10T10:45:51.504719+00:00",
        "sessionId": "e8569e5f-2060-4fa6-944f-85ec7dcb8b37",
        "total": 2.5
      },
      {
        "card": null,
        "cash": null,
        "count": 2,
        "iris": null,
        "latest": "2026-09-13T13:23:42.224694+00:00",
        "sessionId": "e8fab593-8d15-4cf7-968b-23c893f1db53",
        "total": 4739.98
      },
      {
        "card": null,
        "cash": null,
        "count": 3,
        "iris": null,
        "latest": "2026-09-27T07:09:27.111158+00:00",
        "sessionId": "f23ce42c-4ea2-453c-9710-65d09eb90480",
        "total": 120.5
      },
      {
        "card": null,
        "cash": null,
        "count": 1,
        "iris": null,
        "latest": "2026-09-25T13:07:55.94734+00:00",
        "sessionId": "f8093728-6752-40ca-b83b-b85d2ffcb5ba",
        "total": 0.5
      },
      {
        "card": null,
        "cash": null,
        "count": 22,
        "iris": null,
        "latest": "2026-10-06T22:01:53.503805+00:00",
        "sessionId": null,
        "total": 519.03
      }
    ],
    "measured_at": "2026-10-07T17:23:00.859486Z",
    "message": {
      "completed": false,
      "completedAt": null,
      "completedBy": null,
      "id": "chat-1791392960195-p5hevl1gnw",
      "important": true,
      "pinned": true,
      "senderId": "cms1k1bje001xhn3xulr0rooz",
      "storeId": "cmtpopbgo000trhb5ng9ytiru",
      "updatedAt": "2026-10-07T17:10:57.80847"
    },
    "messages": 50,
    "open_tasks": 1,
    "shifts": [
      {
        "cardSales": 0,
        "cashSales": 0,
        "expenses": 0,
        "id": "4d853b34-4ce3-4086-970e-14537cf1fd7b",
        "openingOperational": 1,
        "terminalPos": "MAIN"
      },
      {
        "cardSales": 0,
        "cashSales": 0,
        "expenses": 0,
        "id": "f23ce42c-4ea2-453c-9710-65d09eb90480",
        "openingOperational": 0.5,
        "terminalPos": "LAB-POS-02"
      }
    ],
    "task": {
      "companyId": "cmtpopbgk000prhb5qc60zxus",
      "completedAt": null,
      "completedBy": null,
      "createdAt": "2026-10-07T17:11:22.703639",
      "createdBy": "cms1k1bje001xhn3xulr0rooz",
      "id": "chat-task-1791393082635-c4vy05z23ea",
      "messageId": "chat-1791392960195-p5hevl1gnw",
      "status": "OPEN",
      "storeId": "cmtpopbgo000trhb5ng9ytiru",
      "title": "N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."
    },
    "tasks": 3
  }
]
```

## AFTER unpin
```json
{
  "audit": [
    {
      "action": "STORE_CHAT_MESSAGE_SENT",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "attachmentChecksum": null,
        "attachmentMimeType": null,
        "attachmentName": null,
        "attachmentSize": null,
        "category": "ANNOUNCEMENT",
        "hasAttachment": false,
        "messageId": "chat-1791392960195-p5hevl1gnw"
      },
      "createdAt": "2026-10-07T17:09:20.201",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791392960199-xeobx6b2c8a"
    },
    {
      "action": "STORE_CHAT_ANNOUNCEMENT_PINNED",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "messageId": "chat-1791392960195-p5hevl1gnw",
        "pinned": true
      },
      "createdAt": "2026-10-07T17:10:35.256",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791393035255-qglb7i3atxs"
    },
    {
      "action": "STORE_CHAT_MESSAGE_MARKED_IMPORTANT",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "important": true,
        "messageId": "chat-1791392960195-p5hevl1gnw"
      },
      "createdAt": "2026-10-07T17:10:57.811",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791393057810-2jrcs3xhoeu"
    },
    {
      "action": "STORE_CHAT_TASK_CREATED",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "messageId": "chat-1791392960195-p5hevl1gnw",
        "status": "OPEN",
        "taskId": "chat-task-1791393082635-c4vy05z23ea",
        "title": "N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."
      },
      "createdAt": "2026-10-07T17:11:22.707",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791393082705-dg67jtbv1ju"
    },
    {
      "action": "STORE_CHAT_TASK_COMPLETED",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "messageId": "chat-1791392960195-p5hevl1gnw",
        "status": "COMPLETED",
        "taskId": "chat-task-1791393082635-c4vy05z23ea"
      },
      "createdAt": "2026-10-07T17:11:53.587",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791393113586-tfmqjf7lza"
    },
    {
      "action": "STORE_CHAT_TASK_REOPENED",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "messageId": "chat-1791392960195-p5hevl1gnw",
        "status": "OPEN",
        "taskId": "chat-task-1791393082635-c4vy05z23ea"
      },
      "createdAt": "2026-10-07T17:12:17.686",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791393137684-im9ua7iz3lq"
    },
    {
      "action": "STORE_CHAT_ANNOUNCEMENT_UNPINNED",
      "actorUserId": "cms1k1bje001xhn3xulr0rooz",
      "afterJson": {
        "messageId": "chat-1791392960195-p5hevl1gnw",
        "pinned": false
      },
      "createdAt": "2026-10-07T17:23:22.957",
      "entityId": "chat-1791392960195-p5hevl1gnw",
      "id": "chat-1791393802955-1qy63wkq2t"
    }
  ],
  "control_messages": 0,
  "financial": [
    {
      "card": null,
      "cash": null,
      "count": 6,
      "iris": null,
      "latest": "2026-09-19T21:03:16.010653+00:00",
      "sessionId": "0dc8e497-4975-43db-a180-68e3a7e001ca",
      "total": 9
    },
    {
      "card": null,
      "cash": null,
      "count": 6,
      "iris": null,
      "latest": "2026-09-08T11:09:45.609238+00:00",
      "sessionId": "127e3512-e7ef-4bf9-9df0-a3e93b7a59a4",
      "total": 4.7
    },
    {
      "card": null,
      "cash": null,
      "count": 6,
      "iris": null,
      "latest": "2026-09-17T17:48:28.836701+00:00",
      "sessionId": "1c3d9103-f42e-4583-aa65-5a71f6aeb6b0",
      "total": 4.1
    },
    {
      "card": null,
      "cash": null,
      "count": 10,
      "iris": null,
      "latest": "2026-09-16T19:11:43.162637+00:00",
      "sessionId": "1ec9982e-a525-476d-b9e3-581ff07b3945",
      "total": 9.3
    },
    {
      "card": null,
      "cash": null,
      "count": 1,
      "iris": null,
      "latest": "2026-09-14T17:12:43.502226+00:00",
      "sessionId": "2c2b6997-52dc-4fba-8654-5d810bf76a3d",
      "total": 50.69
    },
    {
      "card": null,
      "cash": null,
      "count": 1,
      "iris": null,
      "latest": "2026-09-25T10:15:08.417935+00:00",
      "sessionId": "3d894e2f-c467-4293-9f57-4553c653601d",
      "total": 0.7
    },
    {
      "card": null,
      "cash": null,
      "count": 2,
      "iris": null,
      "latest": "2026-10-01T09:51:17.723124+00:00",
      "sessionId": "4d7cf5a7-5042-4cd8-9529-81afcda278a6",
      "total": 2.4
    },
    {
      "card": null,
      "cash": null,
      "count": 1,
      "iris": null,
      "latest": "2026-09-26T13:12:21.410915+00:00",
      "sessionId": "66fb2dce-5e4d-44c2-b6cf-d05e495fba5d",
      "total": 0.5
    },
    {
      "card": null,
      "cash": null,
      "count": 3,
      "iris": null,
      "latest": "2026-09-10T09:17:45.311797+00:00",
      "sessionId": "695ec96e-9a72-4977-a705-d5cf3756951e",
      "total": 3
    },
    {
      "card": null,
      "cash": null,
      "count": 2,
      "iris": null,
      "latest": "2026-09-24T17:57:42.93496+00:00",
      "sessionId": "6d682e12-1a17-44c6-bb7b-64762c741643",
      "total": 1
    },
    {
      "card": null,
      "cash": null,
      "count": 19,
      "iris": null,
      "latest": "2026-09-25T12:28:13.631631+00:00",
      "sessionId": "74dfafb0-415a-4129-a87d-8a286eb2e94b",
      "total": 56.22
    },
    {
      "card": null,
      "cash": null,
      "count": 2,
      "iris": null,
      "latest": "2026-09-23T11:30:49.426789+00:00",
      "sessionId": "7f430556-5629-4a84-a9db-f48b27af3dae",
      "total": 0
    },
    {
      "card": null,
      "cash": null,
      "count": 1,
      "iris": null,
      "latest": "2026-09-15T06:21:34.032747+00:00",
      "sessionId": "9bb5b452-5a46-4b10-8b97-cce24c5c7e2c",
      "total": 76.58
    },
    {
      "card": null,
      "cash": null,
      "count": 4,
      "iris": null,
      "latest": "2026-09-24T11:50:28.931885+00:00",
      "sessionId": "9eb71340-941f-4c3f-a7be-d9368d6b47c0",
      "total": 0.5
    },
    {
      "card": null,
      "cash": null,
      "count": 3,
      "iris": null,
      "latest": "2026-09-24T11:02:27.503284+00:00",
      "sessionId": "af1b7fd4-830c-4163-92f2-d7b1e356bc56",
      "total": 0.5
    },
    {
      "card": null,
      "cash": null,
      "count": 2,
      "iris": null,
      "latest": "2026-09-27T16:42:24.611936+00:00",
      "sessionId": "b39ef41a-1d1a-4887-ac88-50ce92903773",
      "total": 6
    },
    {
      "card": null,
      "cash": null,
      "count": 1,
      "iris": null,
      "latest": "2026-09-24T07:47:26.714059+00:00",
      "sessionId": "b9a931e5-054e-4df9-8195-e781fe13c30d",
      "total": 0.5
    },
    {
      "card": null,
      "cash": null,
      "count": 4,
      "iris": null,
      "latest": "2026-09-10T10:45:51.504719+00:00",
      "sessionId": "e8569e5f-2060-4fa6-944f-85ec7dcb8b37",
      "total": 2.5
    },
    {
      "card": null,
      "cash": null,
      "count": 2,
      "iris": null,
      "latest": "2026-09-13T13:23:42.224694+00:00",
      "sessionId": "e8fab593-8d15-4cf7-968b-23c893f1db53",
      "total": 4739.98
    },
    {
      "card": null,
      "cash": null,
      "count": 3,
      "iris": null,
      "latest": "2026-09-27T07:09:27.111158+00:00",
      "sessionId": "f23ce42c-4ea2-453c-9710-65d09eb90480",
      "total": 120.5
    },
    {
      "card": null,
      "cash": null,
      "count": 1,
      "iris": null,
      "latest": "2026-09-25T13:07:55.94734+00:00",
      "sessionId": "f8093728-6752-40ca-b83b-b85d2ffcb5ba",
      "total": 0.5
    },
    {
      "card": null,
      "cash": null,
      "count": 22,
      "iris": null,
      "latest": "2026-10-06T22:01:53.503805+00:00",
      "sessionId": null,
      "total": 519.03
    }
  ],
  "measured_at": "2026-10-07T17:23:30.855976Z",
  "message": {
    "completed": false,
    "completedAt": null,
    "completedBy": null,
    "id": "chat-1791392960195-p5hevl1gnw",
    "important": true,
    "pinned": false,
    "senderId": "cms1k1bje001xhn3xulr0rooz",
    "storeId": "cmtpopbgo000trhb5ng9ytiru",
    "updatedAt": "2026-10-07T17:23:22.953765"
  },
  "messages": 50,
  "open_tasks": 1,
  "shifts": [
    {
      "cardSales": 0,
      "cashSales": 0,
      "expenses": 0,
      "id": "4d853b34-4ce3-4086-970e-14537cf1fd7b",
      "openingOperational": 1,
      "terminalPos": "MAIN"
    },
    {
      "cardSales": 0,
      "cashSales": 0,
      "expenses": 0,
      "id": "f23ce42c-4ea2-453c-9710-65d09eb90480",
      "openingOperational": 0.5,
      "terminalPos": "LAB-POS-02"
    }
  ],
  "task": {
    "companyId": "cmtpopbgk000prhb5qc60zxus",
    "completedAt": null,
    "completedBy": null,
    "createdAt": "2026-10-07T17:11:22.703639",
    "createdBy": "cms1k1bje001xhn3xulr0rooz",
    "id": "chat-task-1791393082635-c4vy05z23ea",
    "messageId": "chat-1791392960195-p5hevl1gnw",
    "status": "OPEN",
    "storeId": "cmtpopbgo000trhb5ng9ytiru",
    "title": "N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."
  },
  "tasks": 3
}
```

## BEFORE unmark
```json
[{"audit":[{"action":"STORE_CHAT_MESSAGE_SENT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"attachmentChecksum":null,"attachmentMimeType":null,"attachmentName":null,"attachmentSize":null,"category":"ANNOUNCEMENT","hasAttachment":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:09:20.201","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791392960199-xeobx6b2c8a"},{"action":"STORE_CHAT_ANNOUNCEMENT_PINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":true},"createdAt":"2026-10-07T17:10:35.256","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393035255-qglb7i3atxs"},{"action":"STORE_CHAT_MESSAGE_MARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:10:57.811","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393057810-2jrcs3xhoeu"},{"action":"STORE_CHAT_TASK_CREATED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"createdAt":"2026-10-07T17:11:22.707","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393082705-dg67jtbv1ju"},{"action":"STORE_CHAT_TASK_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"COMPLETED","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:11:53.587","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393113586-tfmqjf7lza"},{"action":"STORE_CHAT_TASK_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:12:17.686","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393137684-im9ua7iz3lq"},{"action":"STORE_CHAT_ANNOUNCEMENT_UNPINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":false},"createdAt":"2026-10-07T17:23:22.957","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393802955-1qy63wkq2t"}],"control_messages":0,"financial":[{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-19T21:03:16.010653+00:00","sessionId":"0dc8e497-4975-43db-a180-68e3a7e001ca","total":9},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-08T11:09:45.609238+00:00","sessionId":"127e3512-e7ef-4bf9-9df0-a3e93b7a59a4","total":4.7},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-17T17:48:28.836701+00:00","sessionId":"1c3d9103-f42e-4583-aa65-5a71f6aeb6b0","total":4.1},{"card":null,"cash":null,"count":10,"iris":null,"latest":"2026-09-16T19:11:43.162637+00:00","sessionId":"1ec9982e-a525-476d-b9e3-581ff07b3945","total":9.3},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-14T17:12:43.502226+00:00","sessionId":"2c2b6997-52dc-4fba-8654-5d810bf76a3d","total":50.69},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T10:15:08.417935+00:00","sessionId":"3d894e2f-c467-4293-9f57-4553c653601d","total":0.7},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-10-01T09:51:17.723124+00:00","sessionId":"4d7cf5a7-5042-4cd8-9529-81afcda278a6","total":2.4},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-26T13:12:21.410915+00:00","sessionId":"66fb2dce-5e4d-44c2-b6cf-d05e495fba5d","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-10T09:17:45.311797+00:00","sessionId":"695ec96e-9a72-4977-a705-d5cf3756951e","total":3},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-24T17:57:42.93496+00:00","sessionId":"6d682e12-1a17-44c6-bb7b-64762c741643","total":1},{"card":null,"cash":null,"count":19,"iris":null,"latest":"2026-09-25T12:28:13.631631+00:00","sessionId":"74dfafb0-415a-4129-a87d-8a286eb2e94b","total":56.22},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-23T11:30:49.426789+00:00","sessionId":"7f430556-5629-4a84-a9db-f48b27af3dae","total":0},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-15T06:21:34.032747+00:00","sessionId":"9bb5b452-5a46-4b10-8b97-cce24c5c7e2c","total":76.58},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-24T11:50:28.931885+00:00","sessionId":"9eb71340-941f-4c3f-a7be-d9368d6b47c0","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-24T11:02:27.503284+00:00","sessionId":"af1b7fd4-830c-4163-92f2-d7b1e356bc56","total":0.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-27T16:42:24.611936+00:00","sessionId":"b39ef41a-1d1a-4887-ac88-50ce92903773","total":6},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-24T07:47:26.714059+00:00","sessionId":"b9a931e5-054e-4df9-8195-e781fe13c30d","total":0.5},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-10T10:45:51.504719+00:00","sessionId":"e8569e5f-2060-4fa6-944f-85ec7dcb8b37","total":2.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-13T13:23:42.224694+00:00","sessionId":"e8fab593-8d15-4cf7-968b-23c893f1db53","total":4739.98},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-27T07:09:27.111158+00:00","sessionId":"f23ce42c-4ea2-453c-9710-65d09eb90480","total":120.5},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T13:07:55.94734+00:00","sessionId":"f8093728-6752-40ca-b83b-b85d2ffcb5ba","total":0.5},{"card":null,"cash":null,"count":22,"iris":null,"latest":"2026-10-06T22:01:53.503805+00:00","sessionId":null,"total":519.03}],"measured_at":"2026-10-07T17:23:41.956659Z","message":{"completed":false,"completedAt":null,"completedBy":null,"id":"chat-1791392960195-p5hevl1gnw","important":true,"pinned":false,"senderId":"cms1k1bje001xhn3xulr0rooz","storeId":"cmtpopbgo000trhb5ng9ytiru","updatedAt":"2026-10-07T17:23:22.953765"},"messages":50,"open_tasks":1,"shifts":[{"cardSales":0,"cashSales":0,"expenses":0,"id":"4d853b34-4ce3-4086-970e-14537cf1fd7b","openingOperational":1,"terminalPos":"MAIN"},{"cardSales":0,"cashSales":0,"expenses":0,"id":"f23ce42c-4ea2-453c-9710-65d09eb90480","openingOperational":0.5,"terminalPos":"LAB-POS-02"}],"task":{"companyId":"cmtpopbgk000prhb5qc60zxus","completedAt":null,"completedBy":null,"createdAt":"2026-10-07T17:11:22.703639","createdBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-task-1791393082635-c4vy05z23ea","messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","storeId":"cmtpopbgo000trhb5ng9ytiru","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"tasks":3}]
```

## AFTER unmark
```json
[{"audit":[{"action":"STORE_CHAT_MESSAGE_SENT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"attachmentChecksum":null,"attachmentMimeType":null,"attachmentName":null,"attachmentSize":null,"category":"ANNOUNCEMENT","hasAttachment":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:09:20.201","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791392960199-xeobx6b2c8a"},{"action":"STORE_CHAT_ANNOUNCEMENT_PINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":true},"createdAt":"2026-10-07T17:10:35.256","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393035255-qglb7i3atxs"},{"action":"STORE_CHAT_MESSAGE_MARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:10:57.811","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393057810-2jrcs3xhoeu"},{"action":"STORE_CHAT_TASK_CREATED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"createdAt":"2026-10-07T17:11:22.707","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393082705-dg67jtbv1ju"},{"action":"STORE_CHAT_TASK_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"COMPLETED","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:11:53.587","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393113586-tfmqjf7lza"},{"action":"STORE_CHAT_TASK_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:12:17.686","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393137684-im9ua7iz3lq"},{"action":"STORE_CHAT_ANNOUNCEMENT_UNPINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":false},"createdAt":"2026-10-07T17:23:22.957","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393802955-1qy63wkq2t"},{"action":"STORE_CHAT_MESSAGE_UNMARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:23:51.708","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393831705-vh6p72pzhw"}],"control_messages":0,"financial":[{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-19T21:03:16.010653+00:00","sessionId":"0dc8e497-4975-43db-a180-68e3a7e001ca","total":9},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-08T11:09:45.609238+00:00","sessionId":"127e3512-e7ef-4bf9-9df0-a3e93b7a59a4","total":4.7},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-17T17:48:28.836701+00:00","sessionId":"1c3d9103-f42e-4583-aa65-5a71f6aeb6b0","total":4.1},{"card":null,"cash":null,"count":10,"iris":null,"latest":"2026-09-16T19:11:43.162637+00:00","sessionId":"1ec9982e-a525-476d-b9e3-581ff07b3945","total":9.3},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-14T17:12:43.502226+00:00","sessionId":"2c2b6997-52dc-4fba-8654-5d810bf76a3d","total":50.69},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T10:15:08.417935+00:00","sessionId":"3d894e2f-c467-4293-9f57-4553c653601d","total":0.7},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-10-01T09:51:17.723124+00:00","sessionId":"4d7cf5a7-5042-4cd8-9529-81afcda278a6","total":2.4},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-26T13:12:21.410915+00:00","sessionId":"66fb2dce-5e4d-44c2-b6cf-d05e495fba5d","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-10T09:17:45.311797+00:00","sessionId":"695ec96e-9a72-4977-a705-d5cf3756951e","total":3},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-24T17:57:42.93496+00:00","sessionId":"6d682e12-1a17-44c6-bb7b-64762c741643","total":1},{"card":null,"cash":null,"count":19,"iris":null,"latest":"2026-09-25T12:28:13.631631+00:00","sessionId":"74dfafb0-415a-4129-a87d-8a286eb2e94b","total":56.22},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-23T11:30:49.426789+00:00","sessionId":"7f430556-5629-4a84-a9db-f48b27af3dae","total":0},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-15T06:21:34.032747+00:00","sessionId":"9bb5b452-5a46-4b10-8b97-cce24c5c7e2c","total":76.58},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-24T11:50:28.931885+00:00","sessionId":"9eb71340-941f-4c3f-a7be-d9368d6b47c0","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-24T11:02:27.503284+00:00","sessionId":"af1b7fd4-830c-4163-92f2-d7b1e356bc56","total":0.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-27T16:42:24.611936+00:00","sessionId":"b39ef41a-1d1a-4887-ac88-50ce92903773","total":6},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-24T07:47:26.714059+00:00","sessionId":"b9a931e5-054e-4df9-8195-e781fe13c30d","total":0.5},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-10T10:45:51.504719+00:00","sessionId":"e8569e5f-2060-4fa6-944f-85ec7dcb8b37","total":2.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-13T13:23:42.224694+00:00","sessionId":"e8fab593-8d15-4cf7-968b-23c893f1db53","total":4739.98},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-27T07:09:27.111158+00:00","sessionId":"f23ce42c-4ea2-453c-9710-65d09eb90480","total":120.5},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T13:07:55.94734+00:00","sessionId":"f8093728-6752-40ca-b83b-b85d2ffcb5ba","total":0.5},{"card":null,"cash":null,"count":22,"iris":null,"latest":"2026-10-06T22:01:53.503805+00:00","sessionId":null,"total":519.03}],"measured_at":"2026-10-07T17:24:02.356211Z","message":{"completed":false,"completedAt":null,"completedBy":null,"id":"chat-1791392960195-p5hevl1gnw","important":false,"pinned":false,"senderId":"cms1k1bje001xhn3xulr0rooz","storeId":"cmtpopbgo000trhb5ng9ytiru","updatedAt":"2026-10-07T17:23:51.703976"},"messages":50,"open_tasks":1,"shifts":[{"cardSales":0,"cashSales":0,"expenses":0,"id":"4d853b34-4ce3-4086-970e-14537cf1fd7b","openingOperational":1,"terminalPos":"MAIN"},{"cardSales":0,"cashSales":0,"expenses":0,"id":"f23ce42c-4ea2-453c-9710-65d09eb90480","openingOperational":0.5,"terminalPos":"LAB-POS-02"}],"task":{"companyId":"cmtpopbgk000prhb5qc60zxus","completedAt":null,"completedBy":null,"createdAt":"2026-10-07T17:11:22.703639","createdBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-task-1791393082635-c4vy05z23ea","messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","storeId":"cmtpopbgo000trhb5ng9ytiru","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"tasks":3}]
```

## BEFORE message completion
```json
[{"audit":[{"action":"STORE_CHAT_MESSAGE_SENT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"attachmentChecksum":null,"attachmentMimeType":null,"attachmentName":null,"attachmentSize":null,"category":"ANNOUNCEMENT","hasAttachment":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:09:20.201","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791392960199-xeobx6b2c8a"},{"action":"STORE_CHAT_ANNOUNCEMENT_PINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":true},"createdAt":"2026-10-07T17:10:35.256","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393035255-qglb7i3atxs"},{"action":"STORE_CHAT_MESSAGE_MARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:10:57.811","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393057810-2jrcs3xhoeu"},{"action":"STORE_CHAT_TASK_CREATED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"createdAt":"2026-10-07T17:11:22.707","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393082705-dg67jtbv1ju"},{"action":"STORE_CHAT_TASK_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"COMPLETED","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:11:53.587","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393113586-tfmqjf7lza"},{"action":"STORE_CHAT_TASK_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:12:17.686","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393137684-im9ua7iz3lq"},{"action":"STORE_CHAT_ANNOUNCEMENT_UNPINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":false},"createdAt":"2026-10-07T17:23:22.957","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393802955-1qy63wkq2t"},{"action":"STORE_CHAT_MESSAGE_UNMARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:23:51.708","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393831705-vh6p72pzhw"}],"control_messages":0,"financial":[{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-19T21:03:16.010653+00:00","sessionId":"0dc8e497-4975-43db-a180-68e3a7e001ca","total":9},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-08T11:09:45.609238+00:00","sessionId":"127e3512-e7ef-4bf9-9df0-a3e93b7a59a4","total":4.7},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-17T17:48:28.836701+00:00","sessionId":"1c3d9103-f42e-4583-aa65-5a71f6aeb6b0","total":4.1},{"card":null,"cash":null,"count":10,"iris":null,"latest":"2026-09-16T19:11:43.162637+00:00","sessionId":"1ec9982e-a525-476d-b9e3-581ff07b3945","total":9.3},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-14T17:12:43.502226+00:00","sessionId":"2c2b6997-52dc-4fba-8654-5d810bf76a3d","total":50.69},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T10:15:08.417935+00:00","sessionId":"3d894e2f-c467-4293-9f57-4553c653601d","total":0.7},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-10-01T09:51:17.723124+00:00","sessionId":"4d7cf5a7-5042-4cd8-9529-81afcda278a6","total":2.4},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-26T13:12:21.410915+00:00","sessionId":"66fb2dce-5e4d-44c2-b6cf-d05e495fba5d","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-10T09:17:45.311797+00:00","sessionId":"695ec96e-9a72-4977-a705-d5cf3756951e","total":3},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-24T17:57:42.93496+00:00","sessionId":"6d682e12-1a17-44c6-bb7b-64762c741643","total":1},{"card":null,"cash":null,"count":19,"iris":null,"latest":"2026-09-25T12:28:13.631631+00:00","sessionId":"74dfafb0-415a-4129-a87d-8a286eb2e94b","total":56.22},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-23T11:30:49.426789+00:00","sessionId":"7f430556-5629-4a84-a9db-f48b27af3dae","total":0},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-15T06:21:34.032747+00:00","sessionId":"9bb5b452-5a46-4b10-8b97-cce24c5c7e2c","total":76.58},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-24T11:50:28.931885+00:00","sessionId":"9eb71340-941f-4c3f-a7be-d9368d6b47c0","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-24T11:02:27.503284+00:00","sessionId":"af1b7fd4-830c-4163-92f2-d7b1e356bc56","total":0.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-27T16:42:24.611936+00:00","sessionId":"b39ef41a-1d1a-4887-ac88-50ce92903773","total":6},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-24T07:47:26.714059+00:00","sessionId":"b9a931e5-054e-4df9-8195-e781fe13c30d","total":0.5},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-10T10:45:51.504719+00:00","sessionId":"e8569e5f-2060-4fa6-944f-85ec7dcb8b37","total":2.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-13T13:23:42.224694+00:00","sessionId":"e8fab593-8d15-4cf7-968b-23c893f1db53","total":4739.98},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-27T07:09:27.111158+00:00","sessionId":"f23ce42c-4ea2-453c-9710-65d09eb90480","total":120.5},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T13:07:55.94734+00:00","sessionId":"f8093728-6752-40ca-b83b-b85d2ffcb5ba","total":0.5},{"card":null,"cash":null,"count":22,"iris":null,"latest":"2026-10-06T22:01:53.503805+00:00","sessionId":null,"total":519.03}],"measured_at":"2026-10-07T17:24:04.96889Z","message":{"completed":false,"completedAt":null,"completedBy":null,"id":"chat-1791392960195-p5hevl1gnw","important":false,"pinned":false,"senderId":"cms1k1bje001xhn3xulr0rooz","storeId":"cmtpopbgo000trhb5ng9ytiru","updatedAt":"2026-10-07T17:23:51.703976"},"messages":50,"open_tasks":1,"shifts":[{"cardSales":0,"cashSales":0,"expenses":0,"id":"4d853b34-4ce3-4086-970e-14537cf1fd7b","openingOperational":1,"terminalPos":"MAIN"},{"cardSales":0,"cashSales":0,"expenses":0,"id":"f23ce42c-4ea2-453c-9710-65d09eb90480","openingOperational":0.5,"terminalPos":"LAB-POS-02"}],"task":{"companyId":"cmtpopbgk000prhb5qc60zxus","completedAt":null,"completedBy":null,"createdAt":"2026-10-07T17:11:22.703639","createdBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-task-1791393082635-c4vy05z23ea","messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","storeId":"cmtpopbgo000trhb5ng9ytiru","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"tasks":3}]
```

## AFTER message completion
```json
[{"audit":[{"action":"STORE_CHAT_MESSAGE_SENT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"attachmentChecksum":null,"attachmentMimeType":null,"attachmentName":null,"attachmentSize":null,"category":"ANNOUNCEMENT","hasAttachment":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:09:20.201","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791392960199-xeobx6b2c8a"},{"action":"STORE_CHAT_ANNOUNCEMENT_PINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":true},"createdAt":"2026-10-07T17:10:35.256","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393035255-qglb7i3atxs"},{"action":"STORE_CHAT_MESSAGE_MARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:10:57.811","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393057810-2jrcs3xhoeu"},{"action":"STORE_CHAT_TASK_CREATED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"createdAt":"2026-10-07T17:11:22.707","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393082705-dg67jtbv1ju"},{"action":"STORE_CHAT_TASK_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"COMPLETED","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:11:53.587","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393113586-tfmqjf7lza"},{"action":"STORE_CHAT_TASK_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:12:17.686","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393137684-im9ua7iz3lq"},{"action":"STORE_CHAT_ANNOUNCEMENT_UNPINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":false},"createdAt":"2026-10-07T17:23:22.957","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393802955-1qy63wkq2t"},{"action":"STORE_CHAT_MESSAGE_UNMARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:23:51.708","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393831705-vh6p72pzhw"},{"action":"STORE_CHAT_MESSAGE_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"completed":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:24:17.53","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393857528-odelpt4ufx"}],"control_messages":0,"financial":[{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-19T21:03:16.010653+00:00","sessionId":"0dc8e497-4975-43db-a180-68e3a7e001ca","total":9},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-08T11:09:45.609238+00:00","sessionId":"127e3512-e7ef-4bf9-9df0-a3e93b7a59a4","total":4.7},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-17T17:48:28.836701+00:00","sessionId":"1c3d9103-f42e-4583-aa65-5a71f6aeb6b0","total":4.1},{"card":null,"cash":null,"count":10,"iris":null,"latest":"2026-09-16T19:11:43.162637+00:00","sessionId":"1ec9982e-a525-476d-b9e3-581ff07b3945","total":9.3},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-14T17:12:43.502226+00:00","sessionId":"2c2b6997-52dc-4fba-8654-5d810bf76a3d","total":50.69},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T10:15:08.417935+00:00","sessionId":"3d894e2f-c467-4293-9f57-4553c653601d","total":0.7},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-10-01T09:51:17.723124+00:00","sessionId":"4d7cf5a7-5042-4cd8-9529-81afcda278a6","total":2.4},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-26T13:12:21.410915+00:00","sessionId":"66fb2dce-5e4d-44c2-b6cf-d05e495fba5d","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-10T09:17:45.311797+00:00","sessionId":"695ec96e-9a72-4977-a705-d5cf3756951e","total":3},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-24T17:57:42.93496+00:00","sessionId":"6d682e12-1a17-44c6-bb7b-64762c741643","total":1},{"card":null,"cash":null,"count":19,"iris":null,"latest":"2026-09-25T12:28:13.631631+00:00","sessionId":"74dfafb0-415a-4129-a87d-8a286eb2e94b","total":56.22},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-23T11:30:49.426789+00:00","sessionId":"7f430556-5629-4a84-a9db-f48b27af3dae","total":0},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-15T06:21:34.032747+00:00","sessionId":"9bb5b452-5a46-4b10-8b97-cce24c5c7e2c","total":76.58},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-24T11:50:28.931885+00:00","sessionId":"9eb71340-941f-4c3f-a7be-d9368d6b47c0","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-24T11:02:27.503284+00:00","sessionId":"af1b7fd4-830c-4163-92f2-d7b1e356bc56","total":0.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-27T16:42:24.611936+00:00","sessionId":"b39ef41a-1d1a-4887-ac88-50ce92903773","total":6},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-24T07:47:26.714059+00:00","sessionId":"b9a931e5-054e-4df9-8195-e781fe13c30d","total":0.5},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-10T10:45:51.504719+00:00","sessionId":"e8569e5f-2060-4fa6-944f-85ec7dcb8b37","total":2.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-13T13:23:42.224694+00:00","sessionId":"e8fab593-8d15-4cf7-968b-23c893f1db53","total":4739.98},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-27T07:09:27.111158+00:00","sessionId":"f23ce42c-4ea2-453c-9710-65d09eb90480","total":120.5},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T13:07:55.94734+00:00","sessionId":"f8093728-6752-40ca-b83b-b85d2ffcb5ba","total":0.5},{"card":null,"cash":null,"count":22,"iris":null,"latest":"2026-10-06T22:01:53.503805+00:00","sessionId":null,"total":519.03}],"measured_at":"2026-10-07T17:24:27.6281Z","message":{"completed":true,"completedAt":"2026-10-07T17:24:17.526","completedBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-1791392960195-p5hevl1gnw","important":false,"pinned":false,"senderId":"cms1k1bje001xhn3xulr0rooz","storeId":"cmtpopbgo000trhb5ng9ytiru","updatedAt":"2026-10-07T17:24:17.527316"},"messages":50,"open_tasks":1,"shifts":[{"cardSales":0,"cashSales":0,"expenses":0,"id":"4d853b34-4ce3-4086-970e-14537cf1fd7b","openingOperational":1,"terminalPos":"MAIN"},{"cardSales":0,"cashSales":0,"expenses":0,"id":"f23ce42c-4ea2-453c-9710-65d09eb90480","openingOperational":0.5,"terminalPos":"LAB-POS-02"}],"task":{"companyId":"cmtpopbgk000prhb5qc60zxus","completedAt":null,"completedBy":null,"createdAt":"2026-10-07T17:11:22.703639","createdBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-task-1791393082635-c4vy05z23ea","messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","storeId":"cmtpopbgo000trhb5ng9ytiru","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"tasks":3}]
```

## BEFORE message reopen
```json
[{"audit":[{"action":"STORE_CHAT_MESSAGE_SENT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"attachmentChecksum":null,"attachmentMimeType":null,"attachmentName":null,"attachmentSize":null,"category":"ANNOUNCEMENT","hasAttachment":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:09:20.201","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791392960199-xeobx6b2c8a"},{"action":"STORE_CHAT_ANNOUNCEMENT_PINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":true},"createdAt":"2026-10-07T17:10:35.256","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393035255-qglb7i3atxs"},{"action":"STORE_CHAT_MESSAGE_MARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:10:57.811","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393057810-2jrcs3xhoeu"},{"action":"STORE_CHAT_TASK_CREATED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"createdAt":"2026-10-07T17:11:22.707","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393082705-dg67jtbv1ju"},{"action":"STORE_CHAT_TASK_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"COMPLETED","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:11:53.587","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393113586-tfmqjf7lza"},{"action":"STORE_CHAT_TASK_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:12:17.686","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393137684-im9ua7iz3lq"},{"action":"STORE_CHAT_ANNOUNCEMENT_UNPINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":false},"createdAt":"2026-10-07T17:23:22.957","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393802955-1qy63wkq2t"},{"action":"STORE_CHAT_MESSAGE_UNMARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:23:51.708","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393831705-vh6p72pzhw"},{"action":"STORE_CHAT_MESSAGE_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"completed":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:24:17.53","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393857528-odelpt4ufx"}],"control_messages":0,"financial":[{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-19T21:03:16.010653+00:00","sessionId":"0dc8e497-4975-43db-a180-68e3a7e001ca","total":9},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-08T11:09:45.609238+00:00","sessionId":"127e3512-e7ef-4bf9-9df0-a3e93b7a59a4","total":4.7},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-17T17:48:28.836701+00:00","sessionId":"1c3d9103-f42e-4583-aa65-5a71f6aeb6b0","total":4.1},{"card":null,"cash":null,"count":10,"iris":null,"latest":"2026-09-16T19:11:43.162637+00:00","sessionId":"1ec9982e-a525-476d-b9e3-581ff07b3945","total":9.3},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-14T17:12:43.502226+00:00","sessionId":"2c2b6997-52dc-4fba-8654-5d810bf76a3d","total":50.69},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T10:15:08.417935+00:00","sessionId":"3d894e2f-c467-4293-9f57-4553c653601d","total":0.7},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-10-01T09:51:17.723124+00:00","sessionId":"4d7cf5a7-5042-4cd8-9529-81afcda278a6","total":2.4},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-26T13:12:21.410915+00:00","sessionId":"66fb2dce-5e4d-44c2-b6cf-d05e495fba5d","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-10T09:17:45.311797+00:00","sessionId":"695ec96e-9a72-4977-a705-d5cf3756951e","total":3},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-24T17:57:42.93496+00:00","sessionId":"6d682e12-1a17-44c6-bb7b-64762c741643","total":1},{"card":null,"cash":null,"count":19,"iris":null,"latest":"2026-09-25T12:28:13.631631+00:00","sessionId":"74dfafb0-415a-4129-a87d-8a286eb2e94b","total":56.22},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-23T11:30:49.426789+00:00","sessionId":"7f430556-5629-4a84-a9db-f48b27af3dae","total":0},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-15T06:21:34.032747+00:00","sessionId":"9bb5b452-5a46-4b10-8b97-cce24c5c7e2c","total":76.58},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-24T11:50:28.931885+00:00","sessionId":"9eb71340-941f-4c3f-a7be-d9368d6b47c0","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-24T11:02:27.503284+00:00","sessionId":"af1b7fd4-830c-4163-92f2-d7b1e356bc56","total":0.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-27T16:42:24.611936+00:00","sessionId":"b39ef41a-1d1a-4887-ac88-50ce92903773","total":6},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-24T07:47:26.714059+00:00","sessionId":"b9a931e5-054e-4df9-8195-e781fe13c30d","total":0.5},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-10T10:45:51.504719+00:00","sessionId":"e8569e5f-2060-4fa6-944f-85ec7dcb8b37","total":2.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-13T13:23:42.224694+00:00","sessionId":"e8fab593-8d15-4cf7-968b-23c893f1db53","total":4739.98},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-27T07:09:27.111158+00:00","sessionId":"f23ce42c-4ea2-453c-9710-65d09eb90480","total":120.5},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T13:07:55.94734+00:00","sessionId":"f8093728-6752-40ca-b83b-b85d2ffcb5ba","total":0.5},{"card":null,"cash":null,"count":22,"iris":null,"latest":"2026-10-06T22:01:53.503805+00:00","sessionId":null,"total":519.03}],"measured_at":"2026-10-07T17:24:29.629553Z","message":{"completed":true,"completedAt":"2026-10-07T17:24:17.526","completedBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-1791392960195-p5hevl1gnw","important":false,"pinned":false,"senderId":"cms1k1bje001xhn3xulr0rooz","storeId":"cmtpopbgo000trhb5ng9ytiru","updatedAt":"2026-10-07T17:24:17.527316"},"messages":50,"open_tasks":1,"shifts":[{"cardSales":0,"cashSales":0,"expenses":0,"id":"4d853b34-4ce3-4086-970e-14537cf1fd7b","openingOperational":1,"terminalPos":"MAIN"},{"cardSales":0,"cashSales":0,"expenses":0,"id":"f23ce42c-4ea2-453c-9710-65d09eb90480","openingOperational":0.5,"terminalPos":"LAB-POS-02"}],"task":{"companyId":"cmtpopbgk000prhb5qc60zxus","completedAt":null,"completedBy":null,"createdAt":"2026-10-07T17:11:22.703639","createdBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-task-1791393082635-c4vy05z23ea","messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","storeId":"cmtpopbgo000trhb5ng9ytiru","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"tasks":3}]
```

## AFTER message reopen
```json
[{"audit":[{"action":"STORE_CHAT_MESSAGE_SENT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"attachmentChecksum":null,"attachmentMimeType":null,"attachmentName":null,"attachmentSize":null,"category":"ANNOUNCEMENT","hasAttachment":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:09:20.201","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791392960199-xeobx6b2c8a"},{"action":"STORE_CHAT_ANNOUNCEMENT_PINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":true},"createdAt":"2026-10-07T17:10:35.256","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393035255-qglb7i3atxs"},{"action":"STORE_CHAT_MESSAGE_MARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:10:57.811","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393057810-2jrcs3xhoeu"},{"action":"STORE_CHAT_TASK_CREATED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"createdAt":"2026-10-07T17:11:22.707","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393082705-dg67jtbv1ju"},{"action":"STORE_CHAT_TASK_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"COMPLETED","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:11:53.587","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393113586-tfmqjf7lza"},{"action":"STORE_CHAT_TASK_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","taskId":"chat-task-1791393082635-c4vy05z23ea"},"createdAt":"2026-10-07T17:12:17.686","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393137684-im9ua7iz3lq"},{"action":"STORE_CHAT_ANNOUNCEMENT_UNPINNED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"messageId":"chat-1791392960195-p5hevl1gnw","pinned":false},"createdAt":"2026-10-07T17:23:22.957","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393802955-1qy63wkq2t"},{"action":"STORE_CHAT_MESSAGE_UNMARKED_IMPORTANT","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"important":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:23:51.708","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393831705-vh6p72pzhw"},{"action":"STORE_CHAT_MESSAGE_COMPLETED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"completed":true,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:24:17.53","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393857528-odelpt4ufx"},{"action":"STORE_CHAT_MESSAGE_REOPENED","actorUserId":"cms1k1bje001xhn3xulr0rooz","afterJson":{"completed":false,"messageId":"chat-1791392960195-p5hevl1gnw"},"createdAt":"2026-10-07T17:24:40.004","entityId":"chat-1791392960195-p5hevl1gnw","id":"chat-1791393879938-qzmnn1d1qq"}],"control_messages":0,"financial":[{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-19T21:03:16.010653+00:00","sessionId":"0dc8e497-4975-43db-a180-68e3a7e001ca","total":9},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-08T11:09:45.609238+00:00","sessionId":"127e3512-e7ef-4bf9-9df0-a3e93b7a59a4","total":4.7},{"card":null,"cash":null,"count":6,"iris":null,"latest":"2026-09-17T17:48:28.836701+00:00","sessionId":"1c3d9103-f42e-4583-aa65-5a71f6aeb6b0","total":4.1},{"card":null,"cash":null,"count":10,"iris":null,"latest":"2026-09-16T19:11:43.162637+00:00","sessionId":"1ec9982e-a525-476d-b9e3-581ff07b3945","total":9.3},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-14T17:12:43.502226+00:00","sessionId":"2c2b6997-52dc-4fba-8654-5d810bf76a3d","total":50.69},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T10:15:08.417935+00:00","sessionId":"3d894e2f-c467-4293-9f57-4553c653601d","total":0.7},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-10-01T09:51:17.723124+00:00","sessionId":"4d7cf5a7-5042-4cd8-9529-81afcda278a6","total":2.4},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-26T13:12:21.410915+00:00","sessionId":"66fb2dce-5e4d-44c2-b6cf-d05e495fba5d","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-10T09:17:45.311797+00:00","sessionId":"695ec96e-9a72-4977-a705-d5cf3756951e","total":3},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-24T17:57:42.93496+00:00","sessionId":"6d682e12-1a17-44c6-bb7b-64762c741643","total":1},{"card":null,"cash":null,"count":19,"iris":null,"latest":"2026-09-25T12:28:13.631631+00:00","sessionId":"74dfafb0-415a-4129-a87d-8a286eb2e94b","total":56.22},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-23T11:30:49.426789+00:00","sessionId":"7f430556-5629-4a84-a9db-f48b27af3dae","total":0},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-15T06:21:34.032747+00:00","sessionId":"9bb5b452-5a46-4b10-8b97-cce24c5c7e2c","total":76.58},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-24T11:50:28.931885+00:00","sessionId":"9eb71340-941f-4c3f-a7be-d9368d6b47c0","total":0.5},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-24T11:02:27.503284+00:00","sessionId":"af1b7fd4-830c-4163-92f2-d7b1e356bc56","total":0.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-27T16:42:24.611936+00:00","sessionId":"b39ef41a-1d1a-4887-ac88-50ce92903773","total":6},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-24T07:47:26.714059+00:00","sessionId":"b9a931e5-054e-4df9-8195-e781fe13c30d","total":0.5},{"card":null,"cash":null,"count":4,"iris":null,"latest":"2026-09-10T10:45:51.504719+00:00","sessionId":"e8569e5f-2060-4fa6-944f-85ec7dcb8b37","total":2.5},{"card":null,"cash":null,"count":2,"iris":null,"latest":"2026-09-13T13:23:42.224694+00:00","sessionId":"e8fab593-8d15-4cf7-968b-23c893f1db53","total":4739.98},{"card":null,"cash":null,"count":3,"iris":null,"latest":"2026-09-27T07:09:27.111158+00:00","sessionId":"f23ce42c-4ea2-453c-9710-65d09eb90480","total":120.5},{"card":null,"cash":null,"count":1,"iris":null,"latest":"2026-09-25T13:07:55.94734+00:00","sessionId":"f8093728-6752-40ca-b83b-b85d2ffcb5ba","total":0.5},{"card":null,"cash":null,"count":22,"iris":null,"latest":"2026-10-06T22:01:53.503805+00:00","sessionId":null,"total":519.03}],"measured_at":"2026-10-07T17:24:50.829576Z","message":{"completed":false,"completedAt":null,"completedBy":null,"id":"chat-1791392960195-p5hevl1gnw","important":false,"pinned":false,"senderId":"cms1k1bje001xhn3xulr0rooz","storeId":"cmtpopbgo000trhb5ng9ytiru","updatedAt":"2026-10-07T17:24:39.937256"},"messages":50,"open_tasks":1,"shifts":[{"cardSales":0,"cashSales":0,"expenses":0,"id":"4d853b34-4ce3-4086-970e-14537cf1fd7b","openingOperational":1,"terminalPos":"MAIN"},{"cardSales":0,"cashSales":0,"expenses":0,"id":"f23ce42c-4ea2-453c-9710-65d09eb90480","openingOperational":0.5,"terminalPos":"LAB-POS-02"}],"task":{"companyId":"cmtpopbgk000prhb5qc60zxus","completedAt":null,"completedBy":null,"createdAt":"2026-10-07T17:11:22.703639","createdBy":"cms1k1bje001xhn3xulr0rooz","id":"chat-task-1791393082635-c4vy05z23ea","messageId":"chat-1791392960195-p5hevl1gnw","status":"OPEN","storeId":"cmtpopbgo000trhb5ng9ytiru","title":"N16-LAB-20261007-A | Εικονική ανακοίνωση για pin/σημαντικό/εκκρεμότητα."},"tasks":3}]
```
