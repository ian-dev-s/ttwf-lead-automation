---
name: Messaging notifications integration
overview: Add a multi-platform notification system starting with Telegram, hooking into the existing Redis event system to deliver real-time alerts about emails, approvals, scraper events, and lead updates to messaging platforms. The architecture will be provider-based to easily extend to Slack, WhatsApp, and others.
todos:
  - id: notification-types
    content: Create src/lib/notifications/types.ts with NotificationProvider interface, event types, and settings types
    status: completed
  - id: telegram-provider
    content: Create src/lib/notifications/providers/telegram.ts implementing Telegram Bot API (sendMessage, inline keyboards, testConnection)
    status: completed
  - id: formatter
    content: Create src/lib/notifications/formatter.ts to convert AppEvent data into human-readable notification messages
    status: completed
  - id: manager
    content: Create src/lib/notifications/manager.ts to load team settings, check event preferences, and dispatch to providers
    status: completed
  - id: data-model
    content: Add notification fields (telegramBotToken, telegramChatId, telegramEnabled, telegramEvents, notificationsEnabled) to TeamSettingsDoc in firebase/types.ts
    status: completed
  - id: api-routes
    content: "Create API routes: GET/POST /api/notifications/settings, POST /api/notifications/test, POST /api/notifications/telegram/webhook"
    status: completed
  - id: event-integration
    content: Update events.ts helpers to accept teamId, add notification dispatch. Update all call sites (approve route, scraper, AI generate, lead CRUD)
    status: completed
  - id: settings-ui
    content: Add Notifications tab to settings page with Telegram config (bot token, chat ID, test button, event toggles)
    status: completed
isProject: false
---

# Messaging Platform Notification Integration

## Architecture

The system hooks into the existing Redis pub/sub event system in `[src/lib/events.ts](src/lib/events.ts)` and routes events to configured messaging providers. A provider abstraction makes it trivial to add new platforms.

```mermaid
flowchart LR
  subgraph existing [Existing System]
    ApprovalAPI["Approval API"]
    EmailSend["Email Send"]
    Scraper["Scraper"]
    EventSystem["Redis Pub/Sub<br/>events.ts"]
  end

  subgraph new [New Notification Layer]
    Manager["NotificationManager"]
    Formatter["Message Formatter"]
    TelegramProvider["Telegram Provider"]
    SlackProvider["Slack Provider (future)"]
    WhatsAppProvider["WhatsApp Provider (future)"]
  end

  ApprovalAPI --> EventSystem
  EmailSend --> EventSystem
  Scraper --> EventSystem
  Event
```
