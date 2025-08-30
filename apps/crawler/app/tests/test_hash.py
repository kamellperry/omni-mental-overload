from app.core.hash import content_hash


def test_content_hash_stable_same_input():
    p1 = {
        'username': 'alice',
        'followers': 123,
        'bio': 'Founder of Something',
        'captions': ['Building things', 'Every day'],
        'link_domains': ['example.com'],
    }
    p2 = {
        # re-ordered keys + case/spacing changes shouldn't affect hash
        'bio': 'Founder   of  something',
        'captions': ['Building   things', 'every day'],
        'followers': 123,
        'username': 'alice',
        'link_domains': ['example.com'],
    }
    assert content_hash(p1) == content_hash(p2)


def test_content_hash_changes_when_bio_changes():
    a = {'username': 'bob', 'followers': 10, 'bio': 'hello'}
    b = {'username': 'bob', 'followers': 10, 'bio': 'goodbye'}
    assert content_hash(a) != content_hash(b)

