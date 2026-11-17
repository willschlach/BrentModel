# Spec Delta

## Purpose

Defines how a person creates an account from the public sign-up page: with an invite code they get an active account at once, without one they become a pending request, and a code that does not check out is rejected with a clear reason.

## ADDED Requirements

### Requirement: Public sign-up page
The app SHALL offer a sign-up page, reachable without signing in, with fields for email, password, repeated password, and an optional invite code. The sign-in page and the sign-up page SHALL each link to the other.

#### Scenario: Visitor opens the sign-up page
- **WHEN** a signed-out visitor opens the sign-up page
- **THEN** the form is shown with the invite code marked optional

#### Scenario: Moving between the pages
- **WHEN** a visitor on the sign-in page chooses the sign-up link
- **THEN** the sign-up page opens, and it links back to the sign-in page

#### Scenario: Signed-in visitor
- **WHEN** a signed-in user opens the sign-up page
- **THEN** they are taken to the home page

### Requirement: Sign-up with a valid code creates an active account
A sign-up whose invite code is valid for the submitted email SHALL create an account with the status `active` and the role fixed by the invite, SHALL use up the code, and SHALL sign the person in.

#### Scenario: Member invite
- **WHEN** a person signs up with the email and code of an active `member` invite
- **THEN** an active member account exists
- **AND** the person is signed in and sees the app

#### Scenario: Admin invite
- **WHEN** a person signs up with the email and code of an active `admin` invite
- **THEN** the account's role is `admin`

#### Scenario: Code cannot be reused
- **WHEN** the same code is used again after a successful sign-up
- **THEN** the second attempt is rejected as already used

### Requirement: Sign-up without a code creates a pending request
A sign-up with no invite code SHALL create an account with the role `member` and the status `pending`. It SHALL NOT give the person a session. The page SHALL tell them the request was submitted and is awaiting approval.

#### Scenario: Request submitted
- **WHEN** a visitor signs up with an email and password and no code
- **THEN** a pending member account exists
- **AND** the page says the request was submitted and is awaiting approval
- **AND** the visitor is not signed in

#### Scenario: Pending person tries to sign in
- **WHEN** the same person later signs in with correct credentials
- **THEN** the sign-in page says the account is awaiting approval

### Requirement: A supplied code must check out
When an invite code is supplied, the sign-up SHALL succeed only if an active invite exists for the submitted email and the code matches it. Otherwise the sign-up SHALL be rejected, no account SHALL be created, and the page SHALL say which of these applies: no invite for this email, wrong code, expired, already used, revoked, or locked.

#### Scenario: No invite for the email
- **WHEN** a visitor submits a code with an email that has no invite
- **THEN** the sign-up is rejected with a message that no invite exists for that email
- **AND** no account is created, and the visitor is not placed in the pending list

#### Scenario: Wrong code
- **WHEN** a visitor submits the right email with a wrong code
- **THEN** the sign-up is rejected with a message that the code is incorrect
- **AND** the invite's failed-attempt count goes up by one

#### Scenario: Expired, used, revoked, or locked
- **WHEN** the correct code is submitted for an invite that is expired, used, revoked, or locked
- **THEN** the sign-up is rejected with a message naming that state

### Requirement: Code entry is forgiving
The invite code SHALL be accepted regardless of letter case, surrounding spaces, or whether the hyphen is typed.

#### Scenario: Typed differently
- **WHEN** the code `K7MQ-2WXA` is entered as `k7mq2wxa` or ` K7MQ 2WXA `
- **THEN** it is treated as the same code

### Requirement: Only the code decides the outcome
The role and status of a new account SHALL come only from a valid invite, or default to pending member. Any other value a visitor submits with the sign-up, such as a role or a status, SHALL be ignored.

#### Scenario: Visitor sends a role
- **WHEN** a visitor signs up with no code but submits extra data asking for the role `devops`
- **THEN** the account is a pending member

### Requirement: The rules hold if the early check is bypassed
The sign-up rules SHALL be enforced a second time when the account row is created, in the same transaction. A wrong code SHALL still create no account, and no code SHALL still produce only a pending member, even if the early check is switched off or fails.

#### Scenario: Early check disabled
- **WHEN** the early check is not running and a visitor signs up with a wrong code
- **THEN** no account is created

#### Scenario: Early check disabled, no code
- **WHEN** the early check is not running and a visitor signs up with no code
- **THEN** a pending member is created, never an active account

### Requirement: A failed sign-up does not use up a code
A sign-up that fails for any reason after the code was checked, such as a weak password, SHALL NOT consume the code. Two simultaneous sign-ups with the same code SHALL produce at most one account.

#### Scenario: Weak password
- **WHEN** a person submits a valid code with a password shorter than 8 characters
- **THEN** the sign-up is rejected
- **AND** the invite stays active and the code still works

#### Scenario: Simultaneous use
- **WHEN** two sign-ups with the same valid code are submitted at the same moment
- **THEN** exactly one account is created

### Requirement: Existing emails
A sign-up for an email that already has an account, in any status, SHALL be refused with a message saying the email is already registered.

#### Scenario: Email already registered
- **WHEN** someone signs up with an email that belongs to an existing account
- **THEN** the sign-up is refused and no second account is created

### Requirement: Sign-up form validation
The sign-up page SHALL require an email and a password of at least 8 characters, SHALL require the repeated password to match, and SHALL tell the user which field needs attention before anything is sent to the server.

#### Scenario: Passwords differ
- **WHEN** the repeated password does not match
- **THEN** the form is not submitted
- **AND** the page says the passwords do not match

#### Scenario: Empty email
- **WHEN** the email is empty
- **THEN** the form is not submitted and the page asks for an email address

### Requirement: Sign-up page is accessible
The sign-up page SHALL be usable by keyboard and assistive technology, with a visible label on every field, errors announced to assistive technology, and focus moved to the field that needs attention.

#### Scenario: Error is announced
- **WHEN** a sign-up attempt is rejected
- **THEN** the reason is announced to assistive technology

#### Scenario: Keyboard-only sign-up
- **WHEN** a user completes sign-up using only the keyboard
- **THEN** every control on the page is reachable and operable
