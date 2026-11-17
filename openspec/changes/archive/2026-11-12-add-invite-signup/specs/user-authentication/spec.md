# Spec Delta

## MODIFIED Requirements

### Requirement: Signed-out visitors can only reach the login page
The app SHALL show only the sign-in page or the sign-up page to any visitor without a valid session. Direct links to any other page SHALL lead to the sign-in page first. The sign-in page SHALL link to the sign-up page.

#### Scenario: Signed-out visitor opens the app
- **WHEN** a visitor with no session opens any page of the app other than the sign-up page
- **THEN** the login page is shown
- **AND** no page content, navigation, or run data is shown

#### Scenario: Signed-out visitor opens the sign-up page
- **WHEN** a visitor with no session opens the sign-up page
- **THEN** the sign-up page is shown
- **AND** no page content, navigation, or run data is shown

#### Scenario: Signed-out visitor follows a deep link
- **WHEN** a visitor with no session opens a link to a specific page and then signs in successfully
- **THEN** the app takes them to the page they originally requested

#### Scenario: Sign-in page links to sign-up
- **WHEN** a visitor is on the sign-in page
- **THEN** a link to the sign-up page is available
