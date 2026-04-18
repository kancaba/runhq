use runhq_core::logs::{LogStore, Stream};

#[test]
fn push_assigns_monotonic_seqs() {
    let store = LogStore::new();
    let a = store.push("svc", Stream::Stdout, "one".into());
    let b = store.push("svc", Stream::Stdout, "two".into());
    assert_eq!(a.seq + 1, b.seq);
}

#[test]
fn tail_returns_only_after_since_seq() {
    let store = LogStore::new();
    for i in 0..5 {
        store.push("svc", Stream::Stdout, format!("line {i}"));
    }
    let tail = store.tail("svc", 2, 10);
    assert_eq!(tail.len(), 3);
    assert_eq!(tail[0].seq, 3);
}

#[test]
fn clear_wipes_buffer_but_keeps_seq_monotonic() {
    let store = LogStore::new();
    store.push("svc", Stream::Stdout, "a".into());
    store.push("svc", Stream::Stdout, "b".into());
    store.clear("svc");
    let c = store.push("svc", Stream::Stdout, "c".into());
    assert!(c.seq > 2);
    let snap = store.snapshot("svc");
    assert_eq!(snap.len(), 1);
    assert_eq!(snap[0].text, "c");
}
