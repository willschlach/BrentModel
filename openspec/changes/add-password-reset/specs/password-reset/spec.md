# Spec Delta

## Purpose

Defines how a person who has forgotten their password gets back in: they ask for a code by email, enter it with a new password, and are signed in, plus the switch that turns this off and the command-line fallback for devops.

## ADDED Requirements

### Requirement: Password reset can be switched off
The password reset pages and the link to them SHALL be available only when the reset is enabled. It SHALL be enabled by default in local development and disabled by default in production builds, and an explicit setting SHALL override either default. When disabled, the sign-in page SHALL show no link to it, and its addresses SHALL lead to the sign-in page.

#### Scenario: Disabled
- **WHEN** the reset is disabled and a visitor opens the sign-in page
- **THEN** there is no "Forgot password?" link

#### Scenario: Address while disabled
- **WHEN** the reset is disabled and a visitor opens the forgot-password or reset-password address
- **THEN** they are taken to the sign-in page

#### Scenario: Enabled
- **WHEN** the reset is enabled and a visitor opens the sign-in page
- **THEN** a "Forgot password?" link leads to the forgot-password page

### Requirement: Asking for a reset code
The forgot-password page SHALL take an email address and ask for a reset code. It SHALL give the same answer whether or not an account exists for that address, and SHALL then lead the person to the page where the code is entered, with the email already filled in.

#### Scenario: Any email gets the same answer
- **WHEN** a visitor submits an email address
- **THEN** the page says that if an account exists for it, a code has been sent
- **AND** the wording does not depend on whether an account exists

#### Scenario: Empty email
- **WHEN** the email is empty
- **THEN** nothing is sent and the page asks for an email address

#### Scenario: Asking too often
- **WHEN** a code is requested again before the sending limit allows
- **THEN** the page tells the person to wait a minute before asking again

#### Scenario: Email not available for this address
- **WHEN** the email service refuses to deliver to the address
- **THEN** the page says email is not available for that address yet and to ask an administrator to reset the password

### Requirement: The reset email carries a code
The reset email SHALL contain a 6-digit code and no link. The code SHALL be valid for 10 minutes and for one use.

#### Scenario: Email contents
- **WHEN** a reset code is requested for an account
- **THEN** the email contains a 6-digit code and no sign-in or reset link

#### Scenario: Expired code
- **WHEN** a code is entered more than 10 minutes after it was sent
- **THEN** it is rejected as incorrect or expired

#### Scenario: Used code
- **WHEN** a code that has already been used is entered again
- **THEN** it is rejected as incorrect or expired

### Requirement: Setting a new password with the code
The reset page SHALL take the email, the code, and a new password entered twice, and SHALL show the same live checklist as the sign-up page. A correct code SHALL sign the person in with the new password set. Their other sessions SHALL be signed out, and the old password SHALL stop working.

#### Scenario: Successful reset
- **WHEN** a person enters their email, the correct code, and a valid new password
- **THEN** they are signed in and taken to the app
- **AND** signing in with the new password works and the old password does not

#### Scenario: Other sessions end
- **WHEN** a reset succeeds while the account is signed in on another device
- **THEN** that other session is signed out

#### Scenario: Wrong or expired code
- **WHEN** the code is wrong or expired
- **THEN** the page says it is incorrect or expired and offers to send a new one
- **AND** the password is unchanged

#### Scenario: Password not valid
- **WHEN** the new password is too short or the two entries differ
- **THEN** the form is not submitted and the code is not used up

#### Scenario: Server rejects the new password
- **WHEN** the code is correct but the server rejects the new password
- **THEN** the page shows the server's reason and lets the person try another password without asking for a new code

### Requirement: Send a new code
The reset page SHALL let the person ask for a new code. The sending limit SHALL be reported as in the forgot-password page.

#### Scenario: Resend
- **WHEN** the person chooses to send a new code
- **THEN** a new code is requested for the email on the page
- **AND** the page confirms it without saying whether an account exists

### Requirement: Blocked accounts cannot reset
A person whose account is disabled, pending, or without a profile SHALL NOT be able to complete a reset. They SHALL see the same message as when signing in, and the password SHALL be unchanged.

#### Scenario: Disabled account
- **WHEN** the owner of a disabled account enters a correct code and a new password
- **THEN** the page says the account has been disabled
- **AND** the password is unchanged and no session is created

#### Scenario: Pending account
- **WHEN** the owner of a pending account enters a correct code and a new password
- **THEN** the page says the account is awaiting approval
- **AND** the password is unchanged and no session is created

### Requirement: Devops can set a password from the command line
Devops SHALL be able to set an account's password with a command-line script that works while email is unavailable. The script SHALL show which project it will change and which account it found, SHALL ask for confirmation, SHALL require a password of at least 8 characters entered twice, and SHALL change nothing if the email has no account.

#### Scenario: Set a password
- **WHEN** devops runs the script for an existing account and confirms
- **THEN** that account can sign in with the new password

#### Scenario: Unknown email
- **WHEN** the script is run for an email with no account
- **THEN** it stops with an error and changes nothing

#### Scenario: Declined
- **WHEN** devops does not confirm
- **THEN** nothing is changed

#### Scenario: Short password
- **WHEN** the password is shorter than 8 characters
- **THEN** the script stops before changing anything

### Requirement: Password reset pages are accessible
The forgot-password and reset-password pages SHALL be usable by keyboard and assistive technology, with a visible label on every field, errors and confirmations announced to assistive technology, and focus moved to the field that needs attention. The code field SHALL accept a pasted code.

#### Scenario: Error announced
- **WHEN** a request or a code is rejected
- **THEN** the reason is announced to assistive technology and focus moves to the field to correct

#### Scenario: Keyboard only
- **WHEN** a person completes a reset using only the keyboard
- **THEN** every control on both pages is reachable and operable
