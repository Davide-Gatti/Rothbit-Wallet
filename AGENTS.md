# AGENTS.md

## Project Overview

This project aims to develop a wallet compatible with the RGB protocol on the Lightning Network, using Tether’s Wallet Development Kit (WDK).

The implementation is primarily based on the `@utexo/wdk-rgb-lightning` module, which provides the tools required to integrate RGB asset management and related operations over the Lightning Network.

## What Is the RGB Protocol?

RGB is a protocol for issuing and managing digital assets on Bitcoin using client-side validation. Asset-related data is not stored directly on the blockchain; Bitcoin is used for cryptographic commitments and double-spending prevention.

In this project, RGB is used together with the Lightning Network to enable asset management and transfers through payment channels.

### RGB-Specific Guidelines

* Do not assume that the state of RGB assets is globally available on-chain.
* Use the APIs exposed by `@utexo/wdk-rgb-lightning` instead of reimplementing protocol primitives.
* Do not modify commitment, consignment, or client-side validation handling without dedicated tests.
* Follow the patterns already established in the repository before introducing new abstractions.

## Primary Reference

The following repository must be considered the primary and authoritative source of reference for any SDK-related task:

https://github.com/UTEXO-Protocol/wdk-rgb-lightning

Before proceeding with any analysis, modification, or implementation, you must thoroughly review and understand all documentation available in the repository, including the README, examples, configurations, types, interfaces, source code, and technical notes.

All technical decisions must be based exclusively on what is actually documented or implemented in the repository. Do not invent endpoints, methods, parameters, behaviors, or assumptions that cannot be verified.

In the event of a conflict with other sources, the repository content must take precedence.


## WDK Reference

The following documentation provides the general reference for Tether’s Wallet Development Kit (WDK):

https://docs.wdk.tether.io/

The `@utexo/wdk-rgb-lightning` package is a WDK module specifically designed to provide RGB and Lightning Network functionality. Therefore, the general WDK documentation should be consulted to understand the broader architecture, core concepts, shared interfaces, configuration patterns, and conventions used across the WDK ecosystem.

When working on this project:

* Use the `@utexo/wdk-rgb-lightning` repository as the primary source for module-specific behavior, APIs, types, and implementation details.
* Use the general WDK documentation to understand the underlying framework and concepts shared across WDK modules.
* Do not assume that APIs or features documented for other WDK modules are automatically supported by `@utexo/wdk-rgb-lightning`.
* Verify all module-specific methods, parameters, and behaviors against the `@utexo/wdk-rgb-lightning` repository before using them.
* In case of ambiguity or conflict, the implementation and documentation in the `@utexo/wdk-rgb-lightning` repository must take precedence for all RGB and Lightning-specific functionality.

## Development Environment
This project is intended to be developed specifically for Android. All implementation decisions, architecture, dependencies and optimizations should prioritize the Android platform. Avoid to introduce cross-platform abstractions or platform-specific code for other operating systems unless explicitly requested.
