import csv
import io
import json
import os
import tempfile
import unittest
import urllib.error
import urllib.parse

import creator_sync as cs


def account(followers, likes=None, comments=None):
    media = []
    for i in range(len(likes or [])):
        m = {"comments_count": comments[i] if comments else 0}
        if likes[i] is not None:
            m["like_count"] = likes[i]
        media.append(m)
    return {"followers_count": followers, "media": {"data": media}}


class EvaluateTest(unittest.TestCase):
    def test_honest_creator_has_no_flags(self):
        out = cs.evaluate({"declared_followers": "10000"}, account(10000, [400, 300], [20, 10]))
        self.assertEqual(out["flags"], "")
        self.assertEqual(out["gap_pct"], 0.0)
        self.assertEqual(out["engagement_rate_pct"], 3.65)

    def test_inflated_declaration_is_flagged(self):
        out = cs.evaluate({"declared_followers": "50000"}, account(20000, [800], [40]))
        self.assertIn(cs.FLAG_INFLATED, out["flags"])
        self.assertEqual(out["gap_pct"], 150.0)

    def test_low_engagement_is_flagged(self):
        out = cs.evaluate({"declared_followers": "100000"}, account(100000, [200, 300], [5, 5]))
        self.assertIn(cs.FLAG_LOW_ENGAGEMENT, out["flags"])

    def test_hidden_likes_skip_engagement_check(self):
        out = cs.evaluate({"declared_followers": "5000"}, account(5000, [None, None], [3, 4]))
        self.assertEqual(out["avg_likes"], "")
        self.assertEqual(out["engagement_rate_pct"], "")
        self.assertEqual(out["flags"], "")

    def test_sudden_jump_is_flagged(self):
        out = cs.evaluate({"declared_followers": ""}, account(13000, [500], [20]), previous_followers=10000)
        self.assertIn(cs.FLAG_JUMP, out["flags"])


class FetchTest(unittest.TestCase):
    def test_parses_business_discovery(self):
        body = {"business_discovery": {"followers_count": 1234}, "id": "1"}

        def opener(url, timeout):
            self.assertIn("business_discovery.username(dana)", urllib.parse.unquote(url))
            return io.BytesIO(json.dumps(body).encode())

        self.assertEqual(cs.fetch_account("dana", "1", "t", opener=opener)["followers_count"], 1234)

    def test_api_error_becomes_lookup_error(self):
        def opener(url, timeout):
            err_body = io.BytesIO(json.dumps({"error": {"message": "Invalid user id"}}).encode())
            raise urllib.error.HTTPError(url, 400, "Bad Request", {}, err_body)

        with self.assertRaisesRegex(cs.LookupError_, "Invalid user id"):
            cs.fetch_account("ghost", "1", "t", opener=opener)


class RunTest(unittest.TestCase):
    def test_end_to_end_with_history(self):
        data = {"dana": account(10000, [400], [20]), "liat": account(20000, [800], [30])}

        def fetch(handle, user_id, token, version):
            if handle not in data:
                raise cs.LookupError_("not found")
            return data[handle]

        with tempfile.TemporaryDirectory() as d:
            creators = os.path.join(d, "creators.csv")
            report = os.path.join(d, "report.csv")
            history = os.path.join(d, "history.csv")
            with open(creators, "w", encoding="utf-8") as f:
                f.write("name,instagram_handle,declared_followers\n"
                        "Dana,@Dana,10000\nLiat,liat,60000\nGhost,ghost,5000\n")

            cs.run(creators, report, history, "1", "t", "v23.0", fetch=fetch)
            data["dana"] = account(14000, [400], [20])
            rows = cs.run(creators, report, history, "1", "t", "v23.0", fetch=fetch)

            by_handle = {r["instagram_handle"]: r for r in rows}
            self.assertEqual(by_handle["dana"]["actual_followers"], 14000)
            self.assertIn(cs.FLAG_JUMP, by_handle["dana"]["flags"])
            self.assertIn(cs.FLAG_INFLATED, by_handle["liat"]["flags"])
            self.assertEqual(by_handle["ghost"]["flags"], cs.FLAG_NOT_FOUND)

            with open(report, encoding="utf-8-sig") as f:
                self.assertEqual(len(list(csv.DictReader(f))), 3)
            with open(history, encoding="utf-8") as f:
                self.assertEqual(len(list(csv.DictReader(f))), 4)


if __name__ == "__main__":
    unittest.main()
