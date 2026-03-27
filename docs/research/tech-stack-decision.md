# Crystata Tech Stack Research — March 2026

## Decision: Kotlin + Jetpack Compose (Android-first, Compose Multiplatform for future iOS)

### Framework Comparison: React Native vs Kotlin

| Factor | React Native | Kotlin/Compose |
|--------|-------------|----------------|
| Performance (large datasets) | Good w/ New Architecture (0.76+) | Excellent (native compiled, no JS bridge) |
| Security APIs (biometrics, keystore) | Via native modules/Expo | Direct platform access |
| Charting | victory-native, skia-based | Vico 3.x (mature, M3 theming, CMP support) |
| Local database | WatermelonDB, MMKV | Room 2.7+ / SQLDelight (mature, KMP-ready) |
| Ecosystem size | Larger but more churn | Smaller but stable, rapidly growing |
| iOS support | Built-in cross-platform | Compose Multiplatform 1.10.x (stable for iOS since May 2025) |
| Finance industry adoption | Adequate | Superior (Cash App, Forbes, McDonald's use KMP) |

### Why Kotlin Wins for Crystata

1. **Data-heavy app** — no JS bridge overhead for transaction processing, charting, calculations
2. **Security** — direct Android Keystore, BiometricPrompt, EncryptedSharedPreferences access
3. **Compose Multiplatform is stable for iOS** (CMP 1.10.3) — not locked into Android-only
4. **Finance industry trend** — Cash App, Forbes, McDonald's all use KMP in production
5. **Local-first architecture** cleaner with Room/SQLDelight
6. **60% of top 1,000 Play Store apps** now use Jetpack Compose (Google, Dec 2025)

---

## Recommended Tech Stack

### Core

| Category | Choice | Version | Notes |
|----------|--------|---------|-------|
| Language | Kotlin | 2.2.10+ | K2 compiler (stable, default) |
| UI | Jetpack Compose | 1.10.x | Material 3 1.4 |
| Multiplatform | Compose Multiplatform | 1.10.3 | Stable for Android + iOS |
| Architecture | MVI | FlowMVI or Orbit | Unidirectional data flow |
| Navigation | Navigation 3 | New in CMP 1.10.0 | Direct back stack control |
| Min SDK | API 26 (Android 8.0) | | |

### Data & Storage

| Category | Choice | Notes |
|----------|--------|-------|
| Database | Room 2.7+ or SQLDelight | Room for Android-focus; SQLDelight for KMP/SQL control |
| Encryption | SQLCipher | AES-256 encryption at rest |
| Key storage | Android Keystore | Hardware-backed key storage |
| Secure prefs | EncryptedSharedPreferences | For tokens and sensitive config |

### Networking & Serialization

| Category | Choice | Notes |
|----------|--------|-------|
| HTTP client | Ktor Client | Kotlin-native, coroutine-first, KMP |
| JSON | kotlinx.serialization | KMP-native |
| Image loading | Coil 3 | Compose-native, KMP support |

### Architecture & DI

| Category | Choice | Notes |
|----------|--------|-------|
| DI | Koin | KMP-compatible (Hilt is Android-only) |
| Async | Kotlin Coroutines + Flow | Standard reactive primitives |
| State | StateFlow + collectAsStateWithLifecycle | Lifecycle-aware state collection |

### UI & Visualization

| Category | Choice | Notes |
|----------|--------|-------|
| Charts | Vico 3.0.3 | Best Compose chart lib, M3 theming, CMP support |
| Theme | Material 3 | Dynamic color, adaptive layouts |
| Auth UI | AndroidX Biometric | Fingerprint/face auth |

### Bank Account Linking

| Category | Choice | Notes |
|----------|--------|-------|
| Provider | Plaid | 12,000+ financial institutions |
| Pricing | Free sandbox → pay-as-you-go (~$0.90/user/mo) | 200 free production calls |
| Backend | Ktor Server (thin proxy) | Secure token exchange; never store API keys on-device |

#### Plaid Alternatives (if needed)

| Provider | Strength | Best For |
|----------|----------|----------|
| Flinks | 95%+ success rates | Better reconnect rates |
| MX | Data enrichment, 99.9%+ uptime | Normalized/enriched data |
| Yodlee | 16,500+ global FIs | Global coverage (enterprise pricing) |
| Tink (Visa) | European open banking | EU markets |

---

## Architecture

```
┌──────────────────────────────────┐
│      Compose UI Layer            │
│  (Screens, Components, M3 Theme)│
├──────────────────────────────────┤
│      MVI / ViewModel Layer       │
│  (StateFlow, Intents, Effects)   │
├──────────────────────────────────┤
│      Domain / Use Cases          │
│  (Business logic, models)        │
├──────────────────────────────────┤
│      Repository Layer            │
│  (Data orchestration)            │
├───────────┬──────────────────────┤
│  Local    │     Remote           │
│  Room +   │  Ktor → Plaid API   │
│  SQLCipher│  (via thin backend)  │
└───────────┴──────────────────────┘
```

### Data Strategy

- **Local-first**: Device is source of truth (privacy-focused)
- **Optional sync**: CRDT-based sync with E2E encryption for multi-device (future)
- **Categorization**: Plaid's built-in categories + user-defined rule overrides
- **Append-only**: Never overwrite financial history

### Security

- AES-256 encryption at rest (SQLCipher)
- TLS 1.3 for all network calls
- Android Keystore for encryption keys/tokens
- Biometric auth for app access
- JWT with short expiry + rotating refresh tokens
- API keys stored server-side only (thin Ktor backend)
- No regulatory requirements for personal-use-only app

---

## Open Source References

| Project | Stack | Key Learning |
|---------|-------|-------------|
| Ivy Wallet | Kotlin/Compose | Finance app architecture reference |
| MoneyFlow | KMP + Compose Multiplatform | Closest to our target stack |
| Actual Budget | TypeScript, React, SQLite, CRDTs | CRDT sync, local-first design |
| Firefly III | PHP/Laravel, PostgreSQL | Feature inspiration (double-entry, multi-currency) |

---

## Research Sources

- JetBrains: Compose Multiplatform 1.8.0 (iOS stable) and 1.10.0 (Navigation 3, Hot Reload)
- Android Developers: Jetpack Compose December 2025 release notes
- KMPShip: Is KMP Production Ready in 2026
- Plaid pricing and documentation (plaid.com)
- Stfalcon: How to Build a Personal Finance App Like Mint
- James Long: Using CRDTs in the Wild (Actual Budget)
- Vico chart library documentation (GitHub)
- Android Developers: Room for KMP
- Various: Ktor vs Retrofit, Koin vs Hilt, SQLDelight vs Room comparisons
