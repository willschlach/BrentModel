# Spec Delta

## ADDED Requirements

### Requirement: Pending requests are approved or rejected by devops and admin
Devops and admin SHALL be able to approve a pending account, which makes it an active member, and to reject it, which deletes the account. Rejection SHALL be possible only for an account whose status is `pending`, and only through one operation that checks the caller's current role. No other path SHALL let a signed-in user delete an account.

#### Scenario: Admin approves
- **WHEN** an admin sets a pending member's status to `active`
- **THEN** the change is accepted

#### Scenario: Devops rejects
- **WHEN** a devops user rejects a pending account
- **THEN** the authentication user and the profile are deleted

#### Scenario: Reject an active account
- **WHEN** a reject is requested for an account that is not pending
- **THEN** the request is refused and the account is unchanged

#### Scenario: Member tries to reject
- **WHEN** a member asks to reject a pending account
- **THEN** the request is refused and the account is unchanged

#### Scenario: Disabled admin with a valid token
- **WHEN** an admin disabled after signing in asks to reject a pending account
- **THEN** the request is refused and the account is unchanged

#### Scenario: Direct delete
- **WHEN** a signed-in user tries to delete a profile or an authentication user directly
- **THEN** the delete is refused
