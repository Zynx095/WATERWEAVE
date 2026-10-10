"""Visual styling and theme helpers for the WATERWEAVE Streamlit dashboard."""

import streamlit as st

PRIMARY_BLUE = "#0284C7"
SECONDARY_CYAN = "#06B6D4"
COLOR_GREEDY = "#F59E0B"
COLOR_EXACT = "#10B981"
COLOR_QAOA = "#8B5CF6"
BG_CARD_LIGHT = "#F8FAFC"
BORDER_LIGHT = "#E2E8F0"

CUSTOM_CSS = """
<style>
/* Base typography and body styling */
.main .block-container {
    padding-top: 2rem;
    padding-bottom: 3.5rem;
    max-width: 1350px;
}

/* Hero Banner */
.ww-hero {
    background: linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0369A1 100%);
    border-radius: 16px;
    padding: 2.2rem 2.4rem;
    color: #FFFFFF;
    margin-bottom: 1.8rem;
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.ww-hero h1 {
    font-size: 2.4rem;
    font-weight: 800;
    margin: 0 0 0.5rem 0;
    letter-spacing: -0.025em;
    color: #FFFFFF !important;
}

.ww-hero p.tagline {
    font-size: 1.15rem;
    color: #BAE6FD;
    margin-bottom: 1.2rem;
    font-weight: 400;
    line-height: 1.5;
}

/* Badge tags */
.ww-badge-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
}

.ww-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.35rem 0.8rem;
    border-radius: 9999px;
}

.ww-badge-synthetic {
    background-color: #FEF3C7;
    color: #92400E;
    border: 1px solid #FCD34D;
}

.ww-badge-live {
    background-color: #D1FAE5;
    color: #065F46;
    border: 1px solid #6EE7B7;
}

.ww-badge-demo {
    background-color: #E0E7FF;
    color: #3730A3;
    border: 1px solid #C7D2FE;
}

/* Metric Cards */
.ww-metric-card {
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 1.2rem 1.4rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    position: relative;
    overflow: hidden;
    height: 100%;
}

.ww-metric-card.accent-greedy {
    border-top: 4px solid #F59E0B;
}

.ww-metric-card.accent-exact {
    border-top: 4px solid #10B981;
}

.ww-metric-card.accent-qaoa {
    border-top: 4px solid #8B5CF6;
}

.ww-metric-title {
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748B;
    margin-bottom: 0.4rem;
}

.ww-metric-value {
    font-size: 1.9rem;
    font-weight: 800;
    color: #0F172A;
    line-height: 1.1;
    margin-bottom: 0.3rem;
}

.ww-metric-subtext {
    font-size: 0.8rem;
    color: #64748B;
}

/* Callout Box */
.ww-callout-box {
    background: #F8FAFC;
    border: 1px solid #CBD5E1;
    border-left: 5px solid #0284C7;
    border-radius: 8px;
    padding: 1.2rem 1.5rem;
    margin-bottom: 1.5rem;
}

.ww-callout-box h4 {
    margin-top: 0;
    color: #0F172A;
    font-weight: 700;
}

/* Dark mode overrides if user uses dark theme */
@media (prefers-color-scheme: dark) {
    .ww-metric-card {
        background: #1E293B;
        border-color: #334155;
    }
    .ww-metric-value {
        color: #F8FAFC;
    }
    .ww-metric-title, .ww-metric-subtext {
        color: #94A3B8;
    }
    .ww-callout-box {
        background: #1E293B;
        border-color: #475569;
        border-left-color: #38BDF8;
    }
    .ww-callout-box h4 {
        color: #F8FAFC;
    }
}
</style>
"""


def inject_custom_styles() -> None:
    """Inject custom CSS rules into the Streamlit app context."""
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)
