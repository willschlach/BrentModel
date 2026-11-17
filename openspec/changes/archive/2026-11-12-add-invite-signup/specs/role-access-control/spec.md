# Spec Delta

## REMOVED Requirements

### Requirement: Public sign-up is closed
**Reason**: Phase 2 opens sign-up again, under invite rules. Closing it entirely no longer describes the system.
**Migration**: See "Public sign-up is gated", which replaces it.

## ADDED Requirements

### Requirement: Public sign-up is gated
A sign-up made with the public client key SHALL be accepted only under the sign-up rules: with a valid invite code it creates an active account, without a code it creates a pending member, and with an invalid code it creates nothing. No other path SHALL create an account that has access.

#### Scenario: Direct sign-up without a code
- **WHEN** a caller uses the public client key to sign up a new email address with no invite code
- **THEN** a pending member account is created
- **AND** no session is issued

#### Scenario: Direct sign-up with an invalid code
- **WHEN** a caller uses the public client key to sign up with a code that does not check out
- **THEN** the request is refused
- **AND** no authentication user is created

#### Scenario: Direct sign-up asking for more
- **WHEN** a caller signs up through the public API and includes data asking for the role `devops` or the status `active`
- **THEN** the account is a pending member

### Requirement: Every new account gets a profile
Every authentication user SHALL receive a profile in the same transaction that creates it, so no account exists without a role and a status. The profile SHALL be created by the database from the sign-up rules, never by the browser.

#### Scenario: Privileged creation
- **WHEN** an account is created by a privileged process such as the first-devops script
- **THEN** a profile exists for it immediately, as a pending member
- **AND** the process may then set its role and status

#### Scenario: Profile creation fails
- **WHEN** the profile cannot be created
- **THEN** the authentication user is not created either
