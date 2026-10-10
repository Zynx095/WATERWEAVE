# Municipal Data Sources Inventory

This document tracks the research, verification status, and integration feasibility of municipal water, demographic, and environmental datasets for WATERWEAVE.

## Verification Status Definitions
* **VERIFIED_LIVE**: An accessible feed or endpoint was tested, and its data demonstrably changes or is documented as frequently updated.
* **VERIFIED_PERIODIC**: An accessible source provides periodic updates, but not true real-time observations.
* **VERIFIED_STATIC**: An authentic dataset is available, but no ongoing update mechanism was established.
* **VERIFIED_MANUAL**: An authentic dataset can be downloaded or imported manually.
* **DISCOVERED_UNVERIFIED**: A potentially useful source was found but could not be verified.
* **UNAVAILABLE**: The source or required dataset could not be accessed.
* **AUTH_REQUIRED**: Access requires credentials or formal authorization.
* **NOT_SUITABLE**: The data is real but unsuitable for the intended modeling purpose.

## 1. Bengaluru Water Infrastructure & Supply (BWSSB)

### BWSSB Real-Time Supply Data
* **Source name**: BWSSB Public Live API
* **Responsible organization**: Bangalore Water Supply and Sewerage Board (BWSSB)
* **Official source URL**: N/A
* **Data format**: N/A
* **Fields**: City-wide water levels, distribution data
* **Verification date**: 2026-10-10
* **Verification method**: Web search and documentation review of BWSSB systems, OpenCity.in, and smart meter initiatives.
* **Implementation status**: **UNAVAILABLE**
* **Notes**: Research indicates BWSSB uses internal SCADA and IoT systems (e.g. dashboards with IBM) but there is **no public, real-time API** for city-wide or ward-level water supply. Official apps like "BWSSB Sameeksha" are restricted to internal surveyors.

### Bengaluru Water Supply Coverage
* **Source name**: Bengaluru Water Supply Coverage (Historical)
* **Responsible organization**: BWSSB / OpenCity.in
* **Official source URL**: https://data.opencity.in/
* **Geographic coverage**: Bengaluru (Ward or Zone level)
* **Variables provided**: Properties served by municipal connections vs alternatives.
* **Data format**: CSV / Static
* **Authentication**: Free
* **Implementation status**: **VERIFIED_STATIC**
* **Relevance**: Can be used to estimate baseline supply capability per neighborhood.

## 2. Population and Water Demand

### BBMP Ward Population Data
* **Source name**: Bengaluru Ward-wise Census Data - 2011 / BBMP Ward Population
* **Responsible organization**: BBMP (Bruhat Bengaluru Mahanagara Palike)
* **Official source URL**: https://data.opencity.in/
* **Geographic coverage**: Bengaluru (Ward level)
* **Variables provided**: Population count, household count.
* **Data format**: CSV
* **Authentication**: Free
* **Implementation status**: **ILLUSTRATIVE** (Currently simulated in code using typical values for representative neighborhoods, not direct dynamic ingestion of census records)
* **Relevance**: Fundamental for calculating estimated demand per neighborhood using standard per-capita norms (e.g., 135 LPCD for urban areas).

## 3. Weather, Rainfall, Drought, and Environmental Conditions

### Open-Meteo API
* **Source name**: Open-Meteo Free Weather API
* **Responsible organization**: Open-Meteo
* **Official source URL**: https://open-meteo.com/
* **Geographic coverage**: Global (including Bengaluru lat/lon)
* **Variables provided**: Current temperature, precipitation/rainfall, soil moisture.
* **Data format**: JSON API
* **Authentication**: Free, no key required for non-commercial use.
* **Update frequency**: Hourly
* **Implementation status**: **VERIFIED_LIVE**
* **Relevance**: Provides real-time rainfall data as a proxy for immediate local availability or to adjust demand factors.

### IMD & KSNDMC APIs
* **Source name**: India Meteorological Department API / KSNDMC Varuna Mitra
* **Responsible organization**: IMD / KSNDMC
* **Official source URL**: https://api.imd.gov.in/ / https://ksndmc.org/
* **Data format**: JSON
* **Implementation status**: **AUTH_REQUIRED** (IMD API requires registration and terms acceptance. KSNDMC real-time data lacks an open documented API, mostly provided via web dashboards).

## 4. National Water Data Portal (NWIC)
* **Source name**: National Water Informatics Centre APIs
* **Responsible organization**: Ministry of Jal Shakti
* **Official source URL**: https://nwdp.nwic.gov.in/
* **Variables provided**: Reservoir levels.
* **Implementation status**: **DISCOVERED_UNVERIFIED** (Requires checking if endpoints are openly accessible without credentials).
