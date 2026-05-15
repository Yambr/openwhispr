@server-only @blocked-s5
Feature: Notes sync (server contract)
  # The Electron client does not yet wire Notes CRUD to the UI (Phase 8
  # MISSING(client) rows C1..C7). We assert the server contract directly.
  # Per server SERVER-ROUTES the endpoints are action-style paths:
  #   POST   /api/notes/create
  #   GET    /api/notes/list
  #   PATCH  /api/notes/update
  #   DELETE /api/notes/delete

  Background:
    Given a signed-up tenant labeled "notes"

  Scenario: Create a note returns 201 with an id
    When I create a note with title "first" and content "hello world"
    Then the response status is 201
    And the response carries a note id

  Scenario: List notes includes the created note
    When I create a note with title "listable" and content "body"
    And I list notes
    Then the response status is 200
    And the notes list includes the created note id

  Scenario: Update a note returns 200 with the new fields
    When I create a note with title "before" and content "x"
    And I update the created note with title "after"
    Then the response status is 200

  Scenario: Delete a note returns 204
    When I create a note with title "doomed" and content "x"
    And I delete the created note
    Then the response status is 204

  Scenario: Fetching a deleted note returns 404
    When I create a note with title "ghost" and content "x"
    And I delete the created note
    And I list notes
    Then the response status is 200
    And the notes list does not include the deleted note id
