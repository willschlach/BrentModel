# Spec Delta

## Purpose

Defines the roles and account states for the app, how they are carried in a user's token, and the database rules that enforce who may see and change accounts, so that access control does not depend on the browser behaving.

## ADDED Requirements

### Requirement: Every account has one role and one status
An account that can use the app SHALL have exactly one role from `devops`, `admin`, `member` and exactly one status from `pending`, `active`, `disabled`. An authentication user with no matching profile SHALL have no access.

#### Scenario: Account with role and active status
- **WHEN** an account has the role `member` and the status `active`
- **THEN** the account is allowed into the app

#### Scenario: Authentication user without a profile
- **WHEN** an authentication user exists with no profile record
- **THEN** the user cannot obtain a usable session
- **AND** the login page shows the no-access message

#### Scenario: Invalid role or status value
- **WHEN** a write sets a role or status outside the allowed values
- **THEN** the database rejects it

### Requirement: Only active accounts get a usable session
The system SHALL issue a usable session only to accounts whose status is `active` and which have a role. Accounts that are `disabled` or `pending`, or that have no profile, SHALL be refused, with a reason the app can turn into the matching message.

#### Scenario: Disabled account signs in
- **WHEN** a disabled account submits correct credentials
- **THEN** no session is issued
- **AND** the refusal identifies the account as disabled

#### Scenario: Disabled account tries to renew a session
- **WHEN** an account is disabled after sign-in and its client then tries to renew the session
- **THEN** the renewal is refused

#### Scenario: Pending account signs in
- **WHEN** a pending account submits correct credentials
- **THEN** no session is issued
- **AND** the refusal identifies the account as pending

### Requirement: The session token carries role and status
The session token issued to an active account SHALL include the account's role and status, so that the app and the database can make access decisions from the token.

#### Scenario: Token for a devops user
- **WHEN** an active devops account signs in
- **THEN** the issued token identifies the role as `devops` and the status as `active`

#### Scenario: Role changes after sign-in
- **WHEN** an account's role is changed while the user holds a valid token
- **THEN** the new role takes effect in the token the next time it is renewed
- **AND** the earlier role remains in the token until then

### Requirement: Database access requires a live active account
Row-level security SHALL be enabled on every table in the exposed schema. Every policy SHALL require that the caller is currently an active account with a role, checked against the stored profile at the time of the request and not only against the token.

#### Scenario: Disabled user presents a still-valid token
- **WHEN** a user whose account was disabled after their token was issued sends a request with that token
- **THEN** the request is denied and returns no data

#### Scenario: Anonymous request
- **WHEN** a request is made with no user token
- **THEN** the request is denied and returns no data

#### Scenario: New table without a policy
- **WHEN** a table has row-level security enabled and no policy grants access
- **THEN** no non-privileged caller can read or write it

### Requirement: Visibility of accounts depends on role
An active user SHALL be able to read their own profile. Devops users SHALL be able to read all profiles. Admins SHALL be able to read the profiles of members and admins. Members SHALL be able to read only their own.

#### Scenario: Member reads another profile
- **WHEN** a member asks for another user's profile
- **THEN** no row is returned

#### Scenario: Devops lists all profiles
- **WHEN** a devops user asks for the list of profiles
- **THEN** every profile is returned

#### Scenario: Admin asks for a devops profile
- **WHEN** an admin asks for a devops user's profile
- **THEN** no row is returned

### Requirement: Admins act on members only
An admin SHALL be able to change a member's status between `active` and `disabled`, and to promote a member to admin. An admin SHALL NOT be able to change any other role or status, or to act on admin or devops accounts.

#### Scenario: Admin disables a member
- **WHEN** an admin sets a member's status to `disabled`
- **THEN** the change is accepted

#### Scenario: Admin promotes a member
- **WHEN** an admin changes a member's role to `admin`
- **THEN** the change is accepted

#### Scenario: Admin tries to demote an admin
- **WHEN** an admin changes another admin's role to `member`
- **THEN** the change is rejected and the profile is unchanged

#### Scenario: Admin tries to disable a devops user
- **WHEN** an admin sets a devops user's status to `disabled`
- **THEN** the change is rejected and the profile is unchanged

### Requirement: Devops can manage any account
A devops user SHALL be able to change the role or status of any account, including demoting an admin to member and disabling or restoring any account. Disabling SHALL keep the account and its data so it can be restored.

#### Scenario: Devops demotes an admin
- **WHEN** a devops user changes an admin's role to `member`
- **THEN** the change is accepted

#### Scenario: Devops restores a disabled account
- **WHEN** a devops user sets a disabled account's status to `active`
- **THEN** the account can sign in again with its former role

### Requirement: Members cannot change accounts
A member SHALL NOT be able to change any profile, including their own role and status. No user SHALL be able to change their own role or status.

#### Scenario: Member tries to promote themselves
- **WHEN** a member changes their own role to `admin`
- **THEN** the change is rejected and the role is unchanged

#### Scenario: Admin tries to change own role
- **WHEN** an admin changes their own role to `devops`
- **THEN** the change is rejected and the role is unchanged

### Requirement: Devops headcount limits
The system SHALL allow at most 2 active devops accounts and SHALL always keep at least 1 active devops account. These limits SHALL be enforced in the database, so they hold regardless of which client makes the change.

#### Scenario: Third active devops
- **WHEN** a change would make a third devops account active
- **THEN** the change is rejected

#### Scenario: Last devops disabled
- **WHEN** a change would disable or demote the only active devops account
- **THEN** the change is rejected

#### Scenario: Devops removes another devops
- **WHEN** two devops accounts are active and one of them disables the other
- **THEN** the change is accepted
- **AND** one active devops account remains

#### Scenario: Restoring a devops at the cap
- **WHEN** two devops accounts are already active and a change would restore a disabled devops account
- **THEN** the change is rejected

### Requirement: Public sign-up is closed
The system SHALL NOT allow anyone to create an account by calling the authentication service directly with the public key. Accounts SHALL be created only by a privileged process.

#### Scenario: Direct sign-up attempt
- **WHEN** a caller uses the public client key to sign up a new email address
- **THEN** the request is refused
- **AND** no authentication user is created

### Requirement: First devops account is created from the command line
A privileged command-line script SHALL create the first devops account with a confirmed email, an `active` status, and the `devops` role. The script SHALL run only with server-side credentials and SHALL NOT be reachable from the browser.

#### Scenario: Create the first devops
- **WHEN** the operator runs the script with an email and password and no active devops exists
- **THEN** a confirmed devops account is created
- **AND** it can sign in to the app

#### Scenario: Script would exceed the cap
- **WHEN** the operator runs the script while 2 devops accounts are already active
- **THEN** the script stops with an error
- **AND** no account is created

#### Scenario: Script run without credentials
- **WHEN** the operator runs the script without the server-side credentials set
- **THEN** the script stops with an error that names the missing settings
- **AND** no account is created
