"""Input sanitization middleware tests."""

from app.core.sanitize import sanitize_value


def test_sanitize_strips_html():
    result = sanitize_value("<script>alert('xss')</script>")
    assert "<script>" not in result
    assert "&lt;" in result or "&#x3C;" in result


def test_sanitize_escapes_angle_brackets():
    result = sanitize_value("<b>bold</b>")
    assert result == "&lt;b&gt;bold&lt;/b&gt;"


def test_sanitize_string_without_html_unchanged():
    result = sanitize_value("hello world")
    assert result == "hello world"


def test_sanitize_strips_whitespace():
    result = sanitize_value("  hello  ")
    assert result == "hello"


def test_sanitize_dict_recursive():
    result = sanitize_value({"name": "<script>alert(1)</script>", "desc": "safe"})
    assert "&lt;" in result["name"]
    assert result["desc"] == "safe"


def test_sanitize_list_recursive():
    result = sanitize_value(["<script>", "normal"])
    assert "&lt;" in result[0]
    assert result[1] == "normal"


def test_sanitize_none():
    assert sanitize_value(None) is None


def test_sanitize_int():
    assert sanitize_value(42) == 42


def test_sanitize_nested():
    result = sanitize_value({"items": [{"name": "<img src=x onerror=alert(1)>"}]})
    assert "&lt;" in result["items"][0]["name"]


def test_sanitize_empty_string():
    assert sanitize_value("") == ""


def test_sanitize_quotes_escaped():
    result = sanitize_value('say "hello"')
    assert "&quot;" in result or "&#x22;" in result
