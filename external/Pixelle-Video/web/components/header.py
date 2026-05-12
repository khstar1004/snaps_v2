# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Header components for web UI
"""

import streamlit as st

from web.i18n import tr, get_available_languages, set_language
from web.utils.streamlit_helpers import safe_rerun


def render_header():
    """Render page header with title and language selector"""
    st.markdown(
        """
        <style>
        .snaps-hero {
            padding: 18px 22px;
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 8px;
            background: #f8fafc;
            color: #0f172a;
            margin-bottom: 16px;
        }
        .snaps-hero h1 {
            font-size: 28px;
            line-height: 1.2;
            margin: 0 0 6px;
            letter-spacing: 0;
        }
        .snaps-hero p {
            font-size: 14px;
            color: #475569;
            margin: 0;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    col1, col2 = st.columns([4, 1])
    with col1:
        st.markdown(
            f"""
            <div class="snaps-hero">
              <h1>{tr('app.title')}</h1>
              <p>{tr('app.subtitle')}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with col2:
        render_language_selector()


def render_language_selector():
    """Render language selector at the top"""
    languages = get_available_languages()
    lang_options = [f"{code} - {name}" for code, name in languages.items()]
    
    current_lang = st.session_state.get("language", "ko_KR")
    current_index = list(languages.keys()).index(current_lang) if current_lang in languages else 0
    
    selected = st.selectbox(
        tr("language.select"),
        options=lang_options,
        index=current_index,
        label_visibility="collapsed"
    )
    
    selected_code = selected.split(" - ")[0]
    if selected_code != current_lang:
        st.session_state.language = selected_code
        set_language(selected_code)
        safe_rerun()

