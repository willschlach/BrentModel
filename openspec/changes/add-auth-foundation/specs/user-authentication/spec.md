# Spec Delta

## Purpose

Defines how people sign in to and out of the web app with an email and password, how their session persists, and what they see when they cannot get in.

## ADDED Requirements

### Requirement: Signed-out visitors can only reach the login page
The app SHALL show the login page, and nothing else, to any visitor without a valid session. Direct links to other pages SHALL lead to the login page first.

#### Scenario: Signed-out visitor opens the app
- **WHEN** a visitor with no session opens any page of the app
- **THEN** the login page is shown
- **AND** no page content, navigation, or run data is shown

#### Scenario: Signed-out visitor follows a deep link
- **WHEN** a visitor with no session opens a link to a specific page and then signs in successfully
- **THEN** the app takes them to the page they originally requested

### Requirement: Sign in with email and password
The app SHALL let a user sign in with an email address and a password. A successful sign-in SHALL take the user into the app.

#### Scenario: Valid credentials for an active user
- **WHEN** an active user submits their correct email and password
- **THEN** the user is signed in and sees the app

#### Scenario: Wrong email or password
- **WHEN** a user submits an email and password that do not match an account
- **THEN** the login page shows one generic "incorrect email or password" message
- **AND** the message does not reveal whether the email has an account

#### Scenario: Incomplete form
- **WHEN** a user submits the form with the email or password empty
- **THEN** the form is not submitted to the server
- **AND** the page tells the user which field is missing

### Requirement: Blocked accounts get a specific message
The login page SHALL tell a user why they cannot enter when their credentials are correct but their account cannot access the app. Each case SHALL have its own message.

#### Scenario: Account is disabled
- **WHEN** a user with correct credentials signs in and the account is disabled
- **THEN** the login page says the account has been disabled and to contact an administrator
- **AND** the user does not receive a usable session

#### Scenario: Account is pending approval
- **WHEN** a user with correct credentials signs in and the account is pending approval
- **THEN** the login page says the account is awaiting approval
- **AND** the user does not receive a usable session

#### Scenario: Account has no role
- **WHEN** a user with correct credentials signs in and the account has no role assigned
- **THEN** the login page says the account has no access and to contact an administrator
- **AND** the user does not receive a usable session

### Requirement: Session persists across visits
A signed-in user SHALL stay signed in across page reloads, new tabs, and browser restarts until they sign out or their session is revoked. The user SHALL NOT be asked to sign in again while the session remains valid.

#### Scenario: Reload while signed in
- **WHEN** a signed-in user reloads the page
- **THEN** the user remains signed in and the app loads without showing the login page

#### Scenario: Return after closing the browser
- **WHEN** a signed-in user closes the browser, reopens it, and opens the app while their session is still valid
- **THEN** the user is signed in without entering credentials

#### Scenario: Access token expires during use
- **WHEN** a signed-in user's short-lived access token expires while the app is open and the account is still active
- **THEN** the session is renewed in the background
- **AND** the user is not interrupted

### Requirement: Sign out
A signed-in user SHALL be able to sign out from any page. Signing out SHALL end the session on this device and return the user to the login page.

#### Scenario: User signs out
- **WHEN** a signed-in user chooses to sign out
- **THEN** the session is ended and the login page is shown
- **AND** going back in the browser does not show protected content

#### Scenario: User signs out in another tab
- **WHEN** a user signs out in one tab while the app is open in another tab
- **THEN** the other tab returns to the login page without a manual reload

### Requirement: Access is withdrawn while the app is open
The app SHALL stop showing protected content to a user whose account stops being active during a signed-in session, and SHALL tell them why.

#### Scenario: Account disabled during a session
- **WHEN** an administrator disables the account of a user who has the app open
- **THEN** the app ends that user's session without a manual reload
- **AND** the login page shows the disabled-account message

#### Scenario: Refresh is refused
- **WHEN** a signed-in user's session can no longer be renewed because the account is blocked
- **THEN** the app returns to the login page with the message for that state

### Requirement: Login page is accessible
The login page SHALL be usable by keyboard and by assistive technology. Each field SHALL have a visible label, and errors SHALL be announced to assistive technology.

#### Scenario: Error is announced
- **WHEN** a sign-in attempt fails
- **THEN** the error message is announced to assistive technology
- **AND** focus is placed so the user can correct the form

#### Scenario: Keyboard-only sign-in
- **WHEN** a user completes sign-in using only the keyboard
- **THEN** every control on the login page is reachable and operable
