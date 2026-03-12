# SLANG Repository Contribution Guidelines

## Development Workflow

When contributing to the SLANG project, follow this structured workflow after every modification:

### Post-Modification Checklist

After making changes to the codebase, update the following artifacts (if necessary):

- **Tests**: Update or add tests in `src/**/*.test.ts` files
- **Specification**: Update [SPEC.md](../SPEC.md) to reflect syntax or behavioral changes
- **Grammar**: Update [GRAMMAR.md](../GRAMMAR.md) for any grammar/syntax modifications
- **Documentation**: Update relevant docs and inline code comments
- **Readme**: Update [README.md](../README.md) relavant sections if the feature can be "selled" to other user
- **Examples**: Add or update examples in the `examples/` directory
- **Changelog**: Update the changelog
- **Version**: Bump the version in `package.json` if applicable
- **IDE Support**: Ensure the feature is supported in IDEs (see [IDE_SUPPORT.md](./IDE_SUPPORT.md))

---

## Strategic Priorities

### 🤖 LLM-Nativity

Every feature must be generatable and understandable by an LLM.

**Rule**: If an LLM cannot generate the syntax within 30 seconds, it is too complex.

**Implementation Guidelines**:
- Keep syntax intuitive and predictable
- Avoid ambiguous or context-dependent constructs
- Test new features with LLM generation capabilities
- Ensure comprehensive examples in documentation

### 📐 Minimalism

Resist feature creep. Defend the simplicity of "3 primitives": `stake`, `await`, `commit`.

**Rule**: Every new construct must justify breaking simplicity. New constructs are only acceptable if they are syntactic sugar built on the three primitives.

**Implementation Guidelines**:
- Challenge every feature proposal: Can it be expressed with existing primitives?
- If adding syntax sugar, clearly document its relationship to the primitives
- Prefer composition over new keywords
- Review feature necessity against the core mission of SLANG

### 🔄 Portability

Every feature must work in both modes (zero-setup and runtime). If a feature only works in runtime, clearly document the limitation.

**Rule**: No silent failures between execution modes. Portability gaps must be explicit in documentation.

**Implementation Guidelines**:
- Test features in both zero-setup and runtime contexts
- Document mode-specific behavior clearly
- Avoid mode-dependent syntax or semantics
- Provide examples for each supported mode

---

## Practical Examples

### Adding a New Feature

1. **Design** with minimalism in mind
   - Can this be syntactic sugar over `stake/await/commit`?
   - Can an LLM understand it in under 30 seconds?

2. **Implement**
   - Add parser/lexer rules if needed
   - Implement resolver and runtime logic
   - Write tests in `src/**/*.test.ts`

3. **Document** (before merge)
   - Update `GRAMMAR.md` with syntax
   - Update `SPEC.md` with semantics
   - Add example to `examples/` directory
   - Update inline code documentation

4. **Validate**
   - All tests pass: `npm test`
   - Grammar is unambiguous
   - An LLM can understand the feature from examples

---

## Review Criteria

When submitting changes, ensure:

- ✅ All tests pass and new tests are added
- ✅ `GRAMMAR.md` reflects any syntax changes
- ✅ `SPEC.md` is updated with behavioral changes
- ✅ Examples are provided or updated
- ✅ Documentation is comprehensive
- ✅ Complexity justified against minimalism principle
- ✅ LLM-nativity is preserved (syntax is simple and learnable)

---

## Tools & Commands

### Run Tests
```bash
npm test
# or for specific files
node --import tsx/esm --test src/**/*.test.ts
```

### Build
```bash
npm run build
```

### Type Check
```bash
npm run typecheck
```

---

## Reference

- [GRAMMAR.md](../GRAMMAR.md) - Formal grammar specification
- [SPEC.md](../SPEC.md) - Language semantics
- [examples/](../examples/) - Working examples
- [CONTRIBUTING.md](../CONTRIBUTING.md) - General contribution guidelines


