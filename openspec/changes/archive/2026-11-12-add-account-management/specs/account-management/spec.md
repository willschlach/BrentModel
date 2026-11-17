# Spec Delta

## Purpose

Defines the People page where devops and admins approve requests, see who has access, and change it: the pending list, the people table, role changes, disabling and restoring, and the pending count shown in the header.

## ADDED Requirements

### Requirement: People page is for devops and admin
The People page and its header link SHALL be available to devops and admin only. The link SHALL show even when no run data exists. Other users who open the page address SHALL be taken to the home page, and the database SHALL refuse their requests regardless.

#### Scenario: Devops with no run data
- **WHEN** a devops user is signed in and no run data has been published
- **THEN** the header shows a People link

#### Scenario: Admin
- **WHEN** an admin is signed in
- **THEN** the header shows a People link

#### Scenario: Member opens the page address
- **WHEN** a member opens the People page address
- **THEN** no account data is shown and the member is redirected to the home page

### Requirement: Pending count in the header
For devops and admin, the People link SHALL show the number of pending requests the viewer can see, and only when that number is above 0. The count SHALL refresh when the window regains focus, about once a minute, and after any action on the People page. It SHALL be available to assistive technology as text.

#### Scenario: Nothing pending
- **WHEN** there are no pending requests
- **THEN** the People link shows no count

#### Scenario: Requests waiting
- **WHEN** 3 requests are pending
- **THEN** the People link shows 3
- **AND** assistive technology reads it as "3 pending requests"

#### Scenario: One is handled
- **WHEN** a pending request is approved or rejected on the People page
- **THEN** the count drops by one without a page reload

#### Scenario: A new request arrives
- **WHEN** someone signs up without a code while a devops user has the app open
- **THEN** the count includes that request after the next refresh

### Requirement: Tabs with their own addresses
The People page SHALL have a People tab and an Invites tab, each with its own address, `/people` and `/people/invites`, and SHALL mark the current tab as current. The earlier `/invites` address SHALL lead to the Invites tab.

#### Scenario: People tab
- **WHEN** an allowed user opens `/people`
- **THEN** the People tab is shown and marked as current

#### Scenario: Invites tab
- **WHEN** an allowed user opens `/people/invites`
- **THEN** the Invites screen is shown and its tab is marked as current

#### Scenario: Old address
- **WHEN** an allowed user opens `/invites`
- **THEN** they are taken to the Invites tab

### Requirement: Pending requests list
The People tab SHALL list pending requests, oldest first, each with the email, the date it was requested, and the label "email not verified". When there are none, it SHALL say so.

#### Scenario: A request is waiting
- **WHEN** someone has signed up without a code
- **THEN** their email, the date, and the label "email not verified" appear in the list

#### Scenario: No requests
- **WHEN** nothing is pending
- **THEN** the section says there are no pending requests

### Requirement: Approving a request
Devops and admin SHALL be able to approve a pending request. The person becomes an active member, can sign in, and leaves the pending list. The approver SHALL NOT be able to choose another role when approving.

#### Scenario: Approve
- **WHEN** an admin approves a pending request
- **THEN** the person is an active member and appears in the people table
- **AND** they can sign in

#### Scenario: Already handled
- **WHEN** the request was approved or rejected by someone else after the page loaded
- **THEN** the screen says it has already been handled and reloads the lists

### Requirement: Rejecting a request
Devops and admin SHALL be able to reject a pending request, after a confirmation. Rejecting SHALL delete the account and the request, and the person can then sign up again. Only a pending request can be rejected.

#### Scenario: Reject after confirming
- **WHEN** an admin rejects a pending request and confirms
- **THEN** the account no longer exists and the request leaves the list

#### Scenario: Cancel
- **WHEN** an admin starts to reject a request and cancels
- **THEN** the request is unchanged

#### Scenario: Not pending any more
- **WHEN** a reject is attempted on an account that is no longer pending
- **THEN** it is refused with a message and the account is unchanged

### Requirement: People table
The People tab SHALL list every non-pending account the viewer may see, with email, role, status as a word, and created date, sorted by role and then email. Devops sees every account. An admin sees members and admins. The viewer's own row SHALL be marked "(you)" and SHALL have no actions.

#### Scenario: Devops
- **WHEN** a devops user opens the People tab
- **THEN** every active and disabled account is listed

#### Scenario: Admin
- **WHEN** an admin opens the People tab
- **THEN** members and admins are listed and devops accounts are not

#### Scenario: Own row
- **WHEN** a user looks at their own row
- **THEN** it is marked "(you)" and offers no controls

### Requirement: Role changes
Devops SHALL be able to change a member or an admin between `member` and `admin`. An admin SHALL be able to promote a member to `admin` and nothing else. The screen SHALL NOT offer the `devops` role, and SHALL offer no role change on a devops row. A role change SHALL need a confirmation and takes effect in the database at once.

#### Scenario: Devops promotes a member
- **WHEN** a devops user changes a member to admin and confirms
- **THEN** the row shows admin

#### Scenario: Devops demotes an admin
- **WHEN** a devops user changes an admin to member and confirms
- **THEN** the row shows member

#### Scenario: Admin promotes a member
- **WHEN** an admin changes a member to admin and confirms
- **THEN** the row shows admin

#### Scenario: Admin looks at an admin
- **WHEN** an admin looks at another admin's row
- **THEN** the row has no role control and no actions

#### Scenario: Devops role is not offered
- **WHEN** any user opens a role control
- **THEN** it offers only member and admin

#### Scenario: Cancel
- **WHEN** a role change is started and cancelled
- **THEN** the role is unchanged

### Requirement: Disabling and restoring
Devops SHALL be able to disable and restore members, admins, and devops accounts other than their own. An admin SHALL be able to disable and restore members. Disabling SHALL need a confirmation. A disabled person is signed out within about a minute and cannot sign in until restored.

#### Scenario: Admin disables a member
- **WHEN** an admin disables a member and confirms
- **THEN** the row shows disabled
- **AND** the person cannot sign in

#### Scenario: Devops disables an admin
- **WHEN** a devops user disables an admin and confirms
- **THEN** the row shows disabled

#### Scenario: Restore
- **WHEN** a devops user or admin restores a disabled account they may act on
- **THEN** the row shows active and the person can sign in again

#### Scenario: Admin cannot act on an admin
- **WHEN** an admin looks at an admin or devops row
- **THEN** there is no disable or restore control

### Requirement: The database has the last word
When the database refuses a change, the screen SHALL show the reason and leave the row as it was. The two devops limits SHALL be reported in the database's own wording. If a row changed after the page loaded, the screen SHALL reload the lists.

#### Scenario: Last devops
- **WHEN** a devops user tries to disable the only active devops account other than themselves, leaving no active devops
- **THEN** the screen shows that there must always be at least one active devops account
- **AND** the row is unchanged

#### Scenario: Not allowed
- **WHEN** the database refuses a change because the viewer may not make it
- **THEN** the screen says they are not allowed to do that

### Requirement: People page is accessible
The People page SHALL be usable by keyboard and assistive technology. Tables SHALL have column headers. Status, the pending label, and the count SHALL be written as words and not shown by color alone. Each control SHALL be labelled with the person it acts on, and results and errors SHALL be announced.

#### Scenario: Labelled controls
- **WHEN** a screen reader reaches a row's control
- **THEN** it is named with the action and the person's email

#### Scenario: Result announced
- **WHEN** an action succeeds or fails
- **THEN** the result is announced to assistive technology
