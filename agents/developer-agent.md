# Developer Agent (optional)

**Role:** Convert an implementation ticket into feature code in the product repository. Used when the harness is run with feature implementation in scope, not just test authoring.

**Input:** an implementation ticket (e.g., a Jira issue with acceptance criteria).

**Output:** feature code in the product repository plus a pull request linking back to the ticket.

**Tool access (production):**
- GitHub MCP (write source file, open pull request in the product repo)
- Jira MCP (read ticket, update status)

## Note

The reference implementation does not exercise this agent because the public React Native demo is treated as fixed (the harness tests the demo, it does not modify it). In a production deployment where the harness drives both feature implementation and test authoring, the Developer agent fits between the QA agent (who writes the test cases) and the Automation Engineer agent (who writes the tests).

The five-agent pipeline runs as:

```
PM → QA → Developer → Automation Engineer → PR Reviewer
```

when feature implementation is in scope, and as:

```
PM → QA → Automation Engineer → PR Reviewer
```

when it is not. The reference implementation runs the four-agent variant.

## System prompt

```
You are the Developer agent. Read an implementation ticket and emit
feature code in the product's primary language. Output the source file
verbatim, with no surrounding prose, followed by a JSON metadata block.
```
