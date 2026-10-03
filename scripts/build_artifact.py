#!/usr/bin/env python3
"""docs/index.html から、Claudeのプレビュー(Artifact)用ページを生成する。
Artifactは公開時に<html><head><body>を自動で付与するため、それらを除いた中身だけを書き出す。"""
import re, os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(BASE, "docs", "index.html"), encoding="utf-8").read()
head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
keep = "\n".join(l for l in head.splitlines() if re.search(r"<title>|<link ", l))
body = re.search(r"<!-- BODY_START -->(.*?)<!-- BODY_END -->", src, re.S).group(1)
os.makedirs(os.path.join(BASE, "artifact_build"), exist_ok=True)
open(os.path.join(BASE, "artifact_build", "index.html"), "w", encoding="utf-8").write(keep + "\n" + body)
print("ok")
