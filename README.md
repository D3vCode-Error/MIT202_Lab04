# Laboratory Activity No. 4 — ChatLab

**Course:** Advanced System Design and Implementation  
**Laboratory Topic:** WebSocket Design, API Gateway and Versioning, Authentication and Authorization

## Laboratory Activity

This laboratory activity involves developing **ChatLab**, a simple real-time chat application, through four connected exercises:

1. **WebSocket Chat Server** — Implement room-based messaging, JSON message handling, message-size limits, and heartbeat monitoring.
2. **API Gateway and Versioning** — Configure NGINX to route REST and WebSocket traffic, apply request-rate limiting, and support versioned API endpoints.
3. **Authentication with JWT** — Implement login with hashed passwords and JWT verification for REST requests and WebSocket connections.
4. **Authorization with Roles** — Enforce role- and membership-based permissions for room access, messaging, room creation, message deletion, and member removal.

## Learning Outcomes After Completing the Laboratory Activity

Upon completing this laboratory activity, the student should be able to:

1. **Develop** a WebSocket-based chat server using a defined message format, room management, and heartbeat handling.
2. **Configure** an API gateway that routes HTTP and WebSocket requests, applies rate limits, and maintains two API versions concurrently.
3. **Implement** JWT-based authentication for REST endpoints and WebSocket connections.
4. **Apply** role-based authorization when users join rooms and whenever they send messages.
5. **Conduct and interpret** local security and functional tests, including invalid authentication attempts and unauthorized actions, and explain the observed results in a technical report.
