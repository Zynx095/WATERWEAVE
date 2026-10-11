# Project Title

<div align="center">

**WATERWEAVE**

*Seven deliveries requested. Water for four. Who goes without?*

A drought-time water rationing problem, solved three ways: a quick rule of thumb, an exhaustive search, and a quantum circuit. All three run live in a web app that can present itself.

![Track 2](https://img.shields.io/badge/Qiskit%20Fall%20Fest%202026-Track%202-6929C4?style=flat-square)
![Qiskit](https://img.shields.io/badge/Qiskit-QAOA-6929C4?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?style=flat-square)
![React](https://img.shields.io/badge/React-TypeScript-61DAFB?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square)

[The story](#1-project-overview--motivation) · [Run it](#installation--execution-instructions) · [See the demo](#4-implementation-walkthrough--live-demo) · [The honest results](#6-performance-results--limitations)

</div>

---

## Project Metadata

* **Project Title:** WATERWEAVE: Fair Water Allocation with Quantum Optimization
* **Team Name:** WATERWEAVE Project Team
* **Chosen Track:** Track 2: Open-Domain Optimization & Real-World Solvers
* **Video Presentation Link:** *[Pending: submission video URL, to be added before the deadline]*
  *(Access must be "Anyone with the link can view" on Google Drive, or "Unlisted / Public" on YouTube. Locked links cannot be scored.)*
* **Live Demo Timestamp in Video:** *[Pending: e.g. 02:15, once the video is recorded]*

### Team Members (Max 4 members)
| Name | Email | GitHub Username |
| :--- | :--- | :--- |
| Yukith M Joseph | yukithj@gmail.com | [@Zynx095](https://github.com/Zynx095) |

---

## 1. Project Overview & Motivation

* **Summary (3–4 sentences):**
  When a city has less water than people are asking for, somebody has to decide who gets it and when. WATERWEAVE turns that decision into a small, checkable maths problem: seven delivery requests, water for four, and a fairness rule that stops any one neighbourhood from being quietly forgotten. We solve it with a simple rule of thumb, with an exhaustive search that is guaranteed to find the best answer, and with a 12-qubit QAOA circuit built in Qiskit. A web app runs all three on the real engine and can walk an audience through the results on its own.

* **Why this problem / game?**
  My grandmother's house is in New BEL, in Bengaluru, and there were stretches when the water just did not come.

  It was never a headline. The tap would cough, hiss and give up, and the house would start doing quiet arithmetic. How much is left in the sump? What has to be kept for cooking? Who bathes today? Whatever we decided, the same thought sat underneath: somewhere, somebody had opened or closed a valve, and our street had been told to wait.

  I never found out how that choice was made, or whether it was fair to the streets that did get water. So when the hackathon asked for a real-world optimisation problem, that tap was the first thing I thought of. WATERWEAVE is my attempt to make the choice visible: put the requests on a grid, make the rules explicit, and let anybody see what each way of deciding would cost.

  It is also a good fit for QAOA. "Be fair to every pair of neighbourhoods" turns into pairwise terms that look exactly like the energy of a small magnet network, which is the language QAOA speaks. It is small enough to read on a screen and still close enough to real life to matter.

  *A note on honesty: every number here is made up. Demand, supply and storage are synthetic, population figures are illustrative, and nothing comes from a real water utility. The project is about the method, not about any real network.*

---
