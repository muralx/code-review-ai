### Java specifics for security

The JVM's holes are in the libraries: JDBC and JPQL string building, deserialisation of untrusted bytes (native and Jackson polymorphic), XML parsers that resolve external entities by default, and framework security config one `permitAll()` away from open.

### Always check (java)

1. `Statement.execute*`, `prepareStatement(sql + x)`, `createQuery("..." + x)`, `createNativeQuery` with concatenation, Spring Data `@Query` SpEL (`:#{...}`) over raw input, or Criteria built from untrusted field names. **Critical**. Grep the diff for `+` on the line of these calls; expect `?`/`:name` bound via `setParameter`/`setString`. SpotBugs `SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE` and FindSecBugs `SQL_INJECTION_JPA` when available.
2. `ObjectInputStream.readObject()` on external bytes without an `ObjectInputFilter`, Jackson `activateDefaultTyping`/`enableDefaultTyping` or `@JsonTypeInfo(use = Id.CLASS)` on untrusted input, or SnakeYAML `new Yaml()` without `SafeConstructor`/XStream without an allow-list. **Critical**. Grep these calls; a new `Serializable` class alone is not the finding.
3. `DocumentBuilderFactory`, `SAXParserFactory`, `XMLInputFactory`, `TransformerFactory`, `SchemaFactory` or JAXB `Unmarshaller` created without disabling DTDs and external entities (`disallow-doctype-decl`, `FEATURE_SECURE_PROCESSING`, `IS_SUPPORTING_EXTERNAL_ENTITIES=false`, `ACCESS_EXTERNAL_DTD=""`). **Critical** for untrusted XML. Grep `Factory.newInstance()` and read the lines after it; FindSecBugs `XXE_*` when available.
4. `java.util.Random`/`ThreadLocalRandom`/`Math.random()` for tokens, salts, IVs or session ids; algorithm strings `MD5`/`SHA1` for signatures, `DES`, `RC4`, `AES/ECB`, `AES/CBC` without a MAC, `RSA/ECB/PKCS1Padding`; a static IV or literal `SecretKeySpec`; MAC comparison with `Arrays.equals` instead of `MessageDigest.isEqual`. **Critical** for generator and algorithm; **Major** for key and comparison handling. Grep `Cipher.getInstance(`, `MessageDigest.getInstance(`, `new SecretKeySpec(`, `new IvParameterSpec(`.
5. With Spring Security present: `csrf().disable()` on a browser-facing app, a new `permitAll()` matcher, `@PreAuthorize` relied on without `@EnableMethodSecurity`, a `permitAll` matcher placed after `anyRequest()`, or `httpBasic()` without TLS enforcement. **Critical** for widened access to data or mutation; **Major** otherwise. Read the whole `SecurityFilterChain` bean, not only the diff lines.
6. Passwords, tokens, `Authorization` headers or whole request/config objects in `log.*` calls, exception messages, or a `toString()`/`@ToString`/`record` that includes a secret field. **Critical** on a production path. Grep `log.`/`logger.` arguments for `password`, `token`, `secret`, `key`, `authorization`, and any `toString()` of credential holders.
7. Dependency additions or upgrades in `pom.xml`/`build.gradle(.kts)` unchecked for advisories. **Major** with a concrete CVE; **Critical** when the vulnerable class is on an input path. Run `mvn org.owasp:dependency-check-maven:check` or `./gradlew dependencyCheckAnalyze` when configured (needs network or a cached database); otherwise cite the advisory you looked up for that version.
8. Path traversal via `new File(base, name)`, `Paths.get(base, name)` or `base + "/" + name` without `normalize()`/`toRealPath()` plus a `startsWith(baseReal)` check, and `ZipEntry.getName()` extracted without the same check (zip slip). **Critical**. Grep these constructors and `getName()` on zip entries; FindSecBugs `PATH_TRAVERSAL_IN` when available.

### Idioms a reviewer should expect

- `new SecureRandom()` (not a seeded `getInstance("SHA1PRNG")`) for anything security-relevant.
- `AES/GCM/NoPadding` with a fresh 12-byte IV per message; passwords through Argon2, BCrypt or `PBKDF2WithHmacSHA256` with a per-user salt.
- `PreparedStatement` or JPA named parameters everywhere; dynamic sort columns from an enum or allow-list.
- Credentials from the environment or a vault client, never from a properties file in the repo; `char[]` for passwords where the API allows.
- `ObjectMapper` with no default typing and input limits (`StreamReadConstraints`, the framework's max request size).
- Bean Validation (`@Valid`, `@NotNull`, `@Size`) on request DTOs at the controller boundary.
- CORS and security headers configured once in the filter chain, not per controller.

### False positives (java)

- `java.util.Random` for jitter, shuffling, sampling or test data.
- `csrf().disable()` on a stateless token-authenticated API whose chain sets `SessionCreationPolicy.STATELESS` and uses no cookies.
- `permitAll()` on health, metrics, static assets, login and API-docs paths the tree already exposes that way.
- `ObjectInputStream` on a file the application wrote under a path users cannot influence, or with a JVM-wide `jdk.serialFilter` already installed.
- `MD5`/`SHA-1` for ETags, cache keys or content de-duplication.
