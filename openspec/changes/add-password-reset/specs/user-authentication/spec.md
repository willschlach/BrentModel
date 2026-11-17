# Spec Delta

## ADDED Requirements

### Requirement: Sign-in page offers password reset
When password reset is enabled, the sign-in page SHALL link to the forgot-password page.

#### Scenario: Link shown
- **WHEN** password reset is enabled and a visitor is on the sign-in page
- **THEN** a link to the forgot-password page is available

#### Scenario: Link hidden
- **WHEN** password reset is disabled
- **THEN** the sign-in page shows no such link
