# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability, please report it privately — **do not
open a public issue**.

Use GitHub's [private vulnerability reporting](https://github.com/alazaroc/aws-finops-toolkit/security/advisories/new)
(Security → Report a vulnerability), or contact the maintainer directly.

Please include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected component (Lambda handler, CDK/SAM infra, reporting script).

You can expect an initial response within a few days. Once the issue is
confirmed and fixed, coordinated disclosure is welcome.

## Scope

This is a personal open-source project. There is no bug-bounty program, but
responsibly reported issues are genuinely appreciated and will be credited if
you'd like.

## Good to know

- The toolkit runs in **your own AWS account** with the IAM permissions you grant it.
- It is read-oriented (cost analysis, tag governance, reporting); review the IAM
  policies before deploying and apply least privilege.
- No credentials are stored in the repo; it relies on your local AWS profile / CI OIDC role.
