# Spec Delta

## Purpose

Defines what the app shows when no model run data exists yet, so a signed-in user sees a clear explanation instead of an error or a broken page.

## ADDED Requirements

### Requirement: Run data is requested only after sign-in
The app SHALL NOT request run data until the user has a valid session.

#### Scenario: Signed-out visitor
- **WHEN** a visitor with no session opens the app
- **THEN** no request for run data is made

#### Scenario: User signs in
- **WHEN** a user signs in successfully
- **THEN** the app requests run data once

### Requirement: Empty state when no run exists
When no run data is available, a signed-in user SHALL see a clear "no run data yet" message in place of the dashboard pages. The message SHALL NOT be presented as a failure.

#### Scenario: No run data published
- **WHEN** a signed-in user opens the app and no run data has been published
- **THEN** the app shows a "no run data yet" message
- **AND** the message says run data will appear once a model run is published

#### Scenario: Pages that need run data are not offered
- **WHEN** the empty state is shown
- **THEN** the app does not offer navigation to pages that need run data

#### Scenario: Sign out is still available
- **WHEN** the empty state is shown
- **THEN** the user can still sign out

### Requirement: Real failures are reported as errors
The app SHALL distinguish "no run data" from a failure to load run data that does exist. A failure SHALL be reported to the user as an error.

#### Scenario: Server error while loading
- **WHEN** the request for run data fails with a server or network error
- **THEN** the app shows an error message that says the run could not be loaded
- **AND** the app does not show the "no run data yet" message

#### Scenario: Response is not JSON
- **WHEN** the response to the run-data request is successful but is not JSON, such as a web page returned in place of a missing file
- **THEN** the app treats it as no run data and shows the empty state

#### Scenario: Run data has an unsupported version
- **WHEN** the response is JSON run data whose schema version the app does not support
- **THEN** the app shows an error that names the unsupported version
- **AND** the app does not show the "no run data yet" message

### Requirement: No sample run data is shipped
The repository and the production build SHALL NOT include the synthetic sample run file.

#### Scenario: Production build contents
- **WHEN** the app is built for production
- **THEN** the build output contains no sample run data file
