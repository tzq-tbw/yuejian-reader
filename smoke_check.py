import json
import os
import socket
import tempfile
import threading
import time
from pathlib import Path
from io import BytesIO
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import uvicorn
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from backend import main


def post(url, article, method="POST"):
    pdf = isinstance(article, bytes)
    request = Request(
        url, article if pdf else json.dumps(article).encode(),
        {"Content-Type": "application/pdf" if pdf else "application/json"}, method=method
    )
    return urlopen(request, timeout=5)


def example_exam():
    writer = PdfWriter()
    page = writer.add_blank_page(1700, 792)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
    })
    body = ("Students read the article together before they discuss its main ideas. "
            "They return to the text to check supporting details and review words they found difficult.")
    lines = [
        "Section A", body + " ____26____", "A. WRONG CONTENT",
        "Section B", "A] " + body, "36. WRONG CONTENT",
        "Section C", "Passage One", body, "46. WRONG CONTENT",
        "Passage Two", body, "51. WRONG CONTENT",
    ]
    stream = DecodedStreamObject()
    stream.set_data(("BT /F1 10 Tf 16 TL 30 750 Td " +
                     " T* ".join(f"({line}) Tj" for line in lines) + " ET").encode())
    page[NameObject("/Contents")] = stream
    data = BytesIO()
    writer.write(data)
    return data.getvalue()


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as folder, socket.socket() as sock:
        main.DATABASE = Path(folder) / "check.sqlite3"
        sock.bind(("127.0.0.1", 0))
        root = f"http://127.0.0.1:{sock.getsockname()[1]}"
        server = uvicorn.Server(uvicorn.Config(main.app, log_level="error"))
        worker = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
        worker.start()
        try:
            for _ in range(100):
                if server.started:
                    break
                time.sleep(0.05)
            assert server.started
            with urlopen(root, timeout=5) as response:
                assert 'id="entry"' in response.read().decode()
            url = root + "/api/articles"
            article = {"title": "Campus", "body": "Students address a question."}
            with post(url, article) as response:
                assert response.status == 201
                article_id = json.load(response)["id"]
            with urlopen(url, timeout=5) as response:
                assert json.load(response) == [dict(id=article_id, **article)]
            try:
                post(url, {"title": " ", "body": "text"}).close()
            except HTTPError as error:
                assert error.code == 400
                error.close()
            else:
                raise AssertionError("Whitespace title accepted")
            with post(url + f"/{article_id}", dict(article, title="Edited"), "PATCH") as response:
                assert json.load(response)["id"] == article_id

            favorites = root + "/api/favorites"
            item = {"kind": "word", "target": "address",
                    "original_sentence": article["body"], "meaning": "处理"}
            with post(favorites, item) as response:
                first = json.load(response)
                assert first["created"]
            with post(favorites, dict(item, target="Address")) as response:
                assert json.load(response) == dict(first, created=False)
            with post(favorites, dict(item, original_sentence="Write your address.")) as response:
                assert json.load(response)["created"]
            with post(favorites, dict(item, kind="sentence")) as response:
                assert json.load(response)["created"]
            for kind, count in (("word", 2), ("sentence", 1)):
                with urlopen(favorites + "?kind=" + kind, timeout=5) as response:
                    assert len(json.load(response)) == count

            with post(root + "/api/import/pdf", example_exam()) as response:
                assert json.load(response)["count"] == 4
            with urlopen(url, timeout=5) as response:
                saved = json.load(response)
                assert saved[-1]["title"] == "Edited"
                assert any("____26____" in row["body"] for row in saved)
                assert all("WRONG CONTENT" not in row["body"] for row in saved)
            if not os.getenv("DEEPSEEK_API_KEY"):
                try:
                    post(root + "/api/analysis", {"mode": "word", "selection": "address"}).close()
                except HTTPError as error:
                    assert error.code == 503
                    error.close()
                else:
                    raise AssertionError("Missing key accepted")
            print("PASS: homepage, articles, favorites, PDF, missing-key handling")
        finally:
            server.should_exit = True
            worker.join(5)
