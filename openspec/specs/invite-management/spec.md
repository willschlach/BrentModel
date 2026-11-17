# invite-management Specification

## Purpose
Defines invite codes: how they are created, what they look like and how long they last, how they are revoked and regenerated, who may manage them, and the devops screen that does it. A code lets one specific person create an active account with a role chosen in advance.

## Requirements

### Requirement: Only devops and admin can create invites
Creating an invite SHALL require an active devops or admin account, checked against the current stored profile and not only the session token. An invite SHALL be for a role of `member` or `admin`. Invites for `devops` SHALL NOT be possible.

#### Scenario: Devops invites a member
- **WHEN** an active devops user creates an invite for a new email with the role `member`
- **THEN** the invite is created

#### Scenario: Admin invites an admin
- **WHEN** an active admin creates an invite for a new email with the role `admin`
- **THEN** the invite is created

#### Scenario: Member tries to create an invite
- **WHEN** an active member asks to create an invite
- **THEN** the request is rejected and no invite exists

#### Scenario: Invite for a devops role
- **WHEN** any user asks for an invite with the role `devops`
- **THEN** the request is rejected and no invite exists

#### Scenario: Disabled user with a still-valid session
- **WHEN** a devops user disabled after signing in asks to create an invite
- **THEN** the request is rejected and no invite exists

### Requirement: Invite code format
An invite code SHALL be 8 random characters from an alphabet that omits easily confused characters (0, O, 1, I and L), shown as two groups of four separated by a hyphen. The creator SHALL be shown the code exactly once, at creation.

#### Scenario: Code is shown once
- **WHEN** an invite is created
- **THEN** the creator is shown the code in the form `XXXX-XXXX`
- **AND** no later request, by anyone, returns that code again

#### Scenario: Codes differ
- **WHEN** two invites are created
- **THEN** their codes are generated independently and are not derived from the email or the time

### Requirement: Codes are stored only as salted hashes
The system SHALL NOT store an invite code in readable form. It SHALL store only a salted, slow hash, so a copy of the invites data does not reveal usable codes.

#### Scenario: Reading the invites data
- **WHEN** a devops user lists invites
- **THEN** each row shows email, role, status, and dates, and does not include the code or a value from which the code can be read directly

#### Scenario: Code is not kept with the new account
- **WHEN** a person signs up with a valid code
- **THEN** the code is not left in readable form in the new account's stored data

### Requirement: Invite lifetime and single use
An invite SHALL be usable for 24 hours from creation and for one successful sign-up only.

#### Scenario: Use within 24 hours
- **WHEN** the invited person signs up with the correct code 23 hours after creation
- **THEN** the sign-up succeeds

#### Scenario: Use after expiry
- **WHEN** the invited person signs up with the correct code 25 hours after creation
- **THEN** the sign-up is rejected as expired

#### Scenario: Second use
- **WHEN** a code that has already created an account is used again
- **THEN** the sign-up is rejected as already used

### Requirement: Invites are tied to one email
An invite SHALL be for one email address, stored trimmed and in lower case. A sign-up with the code SHALL succeed only when its email matches, ignoring case and surrounding spaces.

#### Scenario: Email matches with different case
- **WHEN** an invite exists for `new.person@example.com` and the person signs up as `New.Person@Example.com` with the correct code
- **THEN** the sign-up succeeds

#### Scenario: Code used with another email
- **WHEN** someone signs up with a valid code but a different email address
- **THEN** the sign-up is rejected and no account is created

### Requirement: One invite per email
There SHALL be at most one invite per email address, in any status. Creating an invite for an email that already has an unused invite, whether active, expired, locked, or revoked, SHALL reuse that invite: it gets a new code, the chosen role, a new 24 hour lifetime, and a fresh attempt count. Creating an invite for an email that already has an account, in any status, SHALL be refused.

#### Scenario: Second invite for the same email
- **WHEN** an invite is created for an email that already has an active invite
- **THEN** that email still has exactly one invite
- **AND** only the new code works, and the role is the one just chosen

#### Scenario: Inviting again after a revoke
- **WHEN** an invite is revoked and a new invite is then created for the same email
- **THEN** the email has one invite, with status `active` and a new code
- **AND** signing up with the new code succeeds

#### Scenario: Email already has an account
- **WHEN** an invite is requested for an email that belongs to an existing account
- **THEN** the request is refused and says an account already exists

#### Scenario: Email belongs to a disabled account
- **WHEN** an invite is requested for an email whose account is disabled
- **THEN** the request is refused and the message says to restore the account instead

#### Scenario: Inviting again after the account was removed
- **WHEN** an account is deleted and its email is then invited
- **THEN** the invite is created, because deleting the account also deleted its invite

### Requirement: Failed attempts lock an invite
After 10 failed sign-up attempts against the same invite, the invite SHALL become locked and SHALL reject every further attempt, including one with the correct code, until it is regenerated.

#### Scenario: Tenth wrong code
- **WHEN** a tenth sign-up attempt with a wrong code is made against an invite
- **THEN** the invite becomes locked

#### Scenario: Correct code on a locked invite
- **WHEN** the correct code is used after the invite is locked
- **THEN** the sign-up is rejected as locked
- **AND** no account is created

#### Scenario: Attempts that do not count
- **WHEN** a sign-up attempt is rejected because no invite exists for the email
- **THEN** no invite's attempt count changes

### Requirement: Each invite has exactly one status
An invite SHALL have exactly one status: `disabled`, `used`, `revoked`, `locked`, `expired`, or `active`, decided in that order of precedence. `disabled` means the invite was used and the account it created is now disabled; it returns to `used` if that account is restored.

#### Scenario: Used and later expired
- **WHEN** an invite was used and its 24 hours then pass
- **THEN** its status is `used`

#### Scenario: Account disabled
- **WHEN** the account created with an invite is disabled
- **THEN** that invite's status becomes `disabled`

#### Scenario: Account restored
- **WHEN** a disabled account is restored to active
- **THEN** its invite's status returns to `used`

#### Scenario: Active invite
- **WHEN** an invite is unused, unrevoked, unlocked, and less than 24 hours old
- **THEN** its status is `active`

### Requirement: Revoking an invite
A devops user SHALL be able to revoke any active invite, and an admin SHALL be able to revoke an active invite they created. A revoked invite SHALL reject every sign-up.

#### Scenario: Devops revokes an invite
- **WHEN** a devops user revokes an active invite
- **THEN** its status becomes `revoked`
- **AND** signing up with its code is rejected as revoked

#### Scenario: Admin revokes someone else's invite
- **WHEN** an admin tries to revoke an invite created by another user
- **THEN** the request is rejected and the invite is unchanged

#### Scenario: Revoking a used invite
- **WHEN** a revoke is requested for an invite that has been used
- **THEN** the request is rejected and the invite stays `used`

### Requirement: Regenerating an invite
Regenerating an invite SHALL give the same invite a new code, a new 24 hour lifetime, and a fresh attempt count, keeping its email and role, and SHALL clear a revocation. An active, expired, locked, or revoked invite SHALL be regenerable. A used invite SHALL NOT.

#### Scenario: Regenerate a locked invite
- **WHEN** a devops user regenerates a locked invite
- **THEN** the invite is `active` again with a new code that is shown once
- **AND** the old code no longer works

#### Scenario: Regenerate a revoked invite
- **WHEN** a devops user regenerates a revoked invite
- **THEN** the invite is `active` again with a new code

#### Scenario: Regenerate a used invite
- **WHEN** a regenerate is requested for a used invite
- **THEN** the request is rejected

### Requirement: Changing an invite's role
A devops user SHALL be able to change the role of an invite that has not been used or revoked, between `member` and `admin`, and an admin SHALL be able to do so for invites they created. The code and the expiry SHALL stay as they are. Used and revoked invites SHALL NOT be changeable.

#### Scenario: Change a role
- **WHEN** a devops user changes an active member invite to `admin`
- **THEN** the invite's role is `admin`
- **AND** the same code still works, and signing up with it creates an admin

#### Scenario: Role for devops
- **WHEN** anyone asks to change an invite's role to `devops`
- **THEN** the request is rejected and the invite is unchanged

#### Scenario: Used or revoked invite
- **WHEN** a role change is requested for a used or revoked invite
- **THEN** the request is rejected and the invite is unchanged

#### Scenario: Someone else's invite
- **WHEN** an admin tries to change the role of an invite created by another user
- **THEN** the request is rejected and the invite is unchanged

### Requirement: Visibility of invites
A devops user SHALL be able to read every invite. Any other active user SHALL be able to read only the invites they created. Clients SHALL NOT be able to write to invites directly; every change goes through the create, revoke, and regenerate operations.

#### Scenario: Admin reads invites
- **WHEN** an admin lists invites
- **THEN** only invites created by that admin are returned

#### Scenario: Direct write
- **WHEN** a signed-in user tries to insert or update an invite row directly
- **THEN** the write is rejected

### Requirement: Invites screen
Devops and admin SHALL have an Invites screen, the Invites tab of the People page, to create an invite (email and role), see invites with email, role, status, created by, created, and expires, change the role of an unused invite, revoke an unused invite, and regenerate an invite. Devops sees every invite; an admin sees only the invites they created. A newly created or regenerated code SHALL be shown once with a warning that it cannot be shown again.

#### Scenario: Create an invite
- **WHEN** a devops user or admin submits an email and a role
- **THEN** the screen shows the new code once, with a warning
- **AND** the invite appears in the list as `active`

#### Scenario: Refused invite
- **WHEN** the database refuses an invite, such as for an email that already has an account
- **THEN** the screen shows the reason and no code

#### Scenario: Change a role from the list
- **WHEN** a devops user or admin changes the role of an active invite in the list
- **THEN** the list shows the new role and says it was changed

#### Scenario: Revoke from the list
- **WHEN** a devops user or admin revokes an active invite from the list
- **THEN** the list shows it as `revoked`

#### Scenario: Admin sees only their own
- **WHEN** an admin opens the Invites tab
- **THEN** only invites created by that admin are listed

### Requirement: Invites screen is for devops and admin
The Invites screen and the People link SHALL be available to devops and admin only. The link SHALL be visible even when no run data exists. Other users who open the page address SHALL be taken away from it, and the database SHALL refuse them regardless.

#### Scenario: Devops with no run data
- **WHEN** a devops user is signed in and no run data has been published
- **THEN** the header still shows the People link

#### Scenario: Admin with no run data
- **WHEN** an admin is signed in and no run data has been published
- **THEN** the header still shows the People link

#### Scenario: Member opens the page address
- **WHEN** a member opens the Invites page address
- **THEN** no invite data is shown and the member is redirected to the home page

### Requirement: Invites screen is accessible
The Invites screen SHALL be usable by keyboard and assistive technology, with labelled fields, errors announced to assistive technology, and status shown as text and not by color alone.

#### Scenario: Error is announced
- **WHEN** creating an invite fails
- **THEN** the error message is announced to assistive technology

#### Scenario: Status without color
- **WHEN** the invite list is shown
- **THEN** each status is written as a word in the row

### Requirement: Removing an account removes its invites
Deleting an account SHALL delete the invite addressed to that email, whatever its status, so none remain in the invites data or in the Invites list. Disabling an account SHALL NOT delete them. Invites that the removed person created for others SHALL be kept.

#### Scenario: Account deleted
- **WHEN** an account is deleted
- **THEN** every invite for its email is deleted, including used and revoked ones
- **AND** the Invites list no longer shows them

#### Scenario: Account disabled
- **WHEN** an account is disabled
- **THEN** its invites are unchanged

#### Scenario: Removed person had created invites
- **WHEN** an account that created invites for other people is deleted
- **THEN** those invites remain, with no creator shown

#### Scenario: Other people's invites
- **WHEN** an account is deleted
- **THEN** invites for other emails are unchanged
