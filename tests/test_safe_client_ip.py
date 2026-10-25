import ipaddress
import pytest
from backend.services.security import (
    TRUSTED_PROXY_NETWORKS,
    is_trusted_proxy,
    get_client_ip_safe,
)


def test_20_distinct_clients_via_vercel_egress():
    vercel_egress = "18.144.20.10"
    resolved_ips = set()
    for i in range(1, 21):
        client_ip = f"203.0.113.{i}"
        xff = f"{client_ip}, {vercel_egress}"
        res = get_client_ip_safe(xff, "10.0.0.1")
        resolved_ips.add(res)
        assert res == client_ip, f"Expected {client_ip}, got {res}"
    assert len(resolved_ips) == 20


def test_20_direct_clients_no_vercel():
    resolved_direct = set()
    for i in range(1, 21):
        client_ip = f"198.51.100.{i}"
        xff = f"{client_ip}"
        res = get_client_ip_safe(xff, "10.0.0.1")
        resolved_direct.add(res)
        assert res == client_ip, f"Expected {client_ip}, got {res}"
    assert len(resolved_direct) == 20


def test_spoofed_prefix_defense():
    vercel_egress = "18.144.20.10"
    real_client = "203.0.113.99"
    spoofed_xff = f"1.1.1.1, 8.8.8.8, {real_client}, {vercel_egress}"
    res = get_client_ip_safe(spoofed_xff, "10.0.0.1")
    assert res == real_client, f"Expected real client {real_client}, got {res}"


def test_is_trusted_proxy():
    assert is_trusted_proxy("127.0.0.1")
    assert is_trusted_proxy("10.0.0.5")
    assert is_trusted_proxy("18.144.1.2")
    assert not is_trusted_proxy("203.0.113.1")
    assert not is_trusted_proxy("invalid-ip")
