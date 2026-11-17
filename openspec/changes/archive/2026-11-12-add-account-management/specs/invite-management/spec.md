# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Devops Invites screen`
- TO: `### Requirement: Invites screen`

- FROM: `### Requirement: Invites screen is for devops only`
- TO: `### Requirement: Invites screen is for devops and admin`

## MODIFIED Requirements

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
