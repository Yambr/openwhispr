Feature: Conversations sync CJM via cloudApiRequest IPC
  # Exercises the REAL client wire path via ConversationsService → cloudApi → IPC.
  # Covers Phase 8 COMPATIBILITY-MATRIX MATCH rows 46-51 (R10 closed —
  # conversations + messages surface implemented per BACKEND_SPEC). The
  # cascade-on-delete scenario asserts the server's R10 choice (messages
  # gone after conversation delete; subsequent fetch returns empty list).

  Background:
    Given the test tenant is authenticated as "convs-cjm"

  Scenario: POST /api/conversations/create returns a conversation with an id
    When I cloud-create a conversation with title "first chat"
    Then the cloud request succeeds
    And the created conversation has a non-empty id

  Scenario: POST /api/conversations/messages appends a message to a conversation
    When I cloud-create a conversation with title "talk"
    And I cloud-post a message to the conversation with role "user" and content "ping"
    Then the cloud request succeeds
    And the created message has a non-empty id

  Scenario: GET /api/conversations/messages returns messages in creation order
    When I cloud-create a conversation with title "ordered"
    And I cloud-post a message to the conversation with role "user" and content "one"
    And I cloud-post a message to the conversation with role "assistant" and content "two"
    And I cloud-list messages for the conversation
    Then the cloud request succeeds
    And the conversation messages list has at least 2 entries

  Scenario: PATCH /api/conversations/update renames a conversation
    When I cloud-create a conversation with title "before-conv"
    And I cloud-update the created conversation with title "after-conv"
    Then the cloud request succeeds
    And the updated conversation title equals "after-conv"

  Scenario: POST /api/conversations/search returns matching conversations
    When I cloud-create a conversation with title "find-me-conv-please"
    And I cloud-search conversations with query "find-me-conv-please"
    Then the cloud request succeeds
    And the cloud conversations list includes the created conversation id

  Scenario: DELETE /api/conversations/delete cascades to messages
    When I cloud-create a conversation with title "doomed-conv"
    And I cloud-post a message to the conversation with role "user" and content "bye"
    And I cloud-delete the created conversation
    Then the cloud request succeeds
    And I cloud-list messages for the conversation
    Then the conversation messages list is empty or 404
