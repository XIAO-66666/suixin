"""Deployment config tests; no provider calls or real user data."""
from pathlib import Path
import unittest
from deploy import command


class Deployment(unittest.TestCase):
    def config(self,**extra):
        return {'RENDER_EXTERNAL_URL':'https://suixin-example.onrender.com','SUIXIN_DB_PATH':str(Path('test-deploy.sqlite3').resolve()),'PORT':'10000',**extra}

    def test_managed_origin_and_persistent_path(self):
        origin,args=command(self.config())
        self.assertEqual(origin,'https://suixin-example.onrender.com')
        self.assertEqual(args[-4:],['--port','10000','--db',self.config()['SUIXIN_DB_PATH']])
        self.assertIn('0.0.0.0',args)

    def test_custom_domain_overrides_managed_domain(self):
        self.assertEqual(command(self.config(SUIXIN_PUBLIC_ORIGIN='https://example.com/'))[0],'https://example.com')

    def test_invalid_config_fails_before_starting(self):
        for extra in ({'SUIXIN_PUBLIC_ORIGIN':'http://example.com'}, {'SUIXIN_PUBLIC_ORIGIN':'https://example.com/path'}, {'SUIXIN_PUBLIC_ORIGIN':'https://example.com?x=1'}, {'SUIXIN_PUBLIC_ORIGIN':'https://user:pass@example.com'}, {'SUIXIN_DB_PATH':'relative.sqlite3'}, {'PORT':'0'}, {'PORT':'not-a-port'}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):command(self.config(**extra))


if __name__=='__main__':unittest.main()
