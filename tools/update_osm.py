#!/usr/bin/env python3
"""Tworzy data/odcinki-osm.json z danych OpenStreetMap (licencja ODbL).

Użycie:  python3 tools/update_osm.py             pobiera aktualne dane
         python3 tools/update_osm.py plik.json   przetwarza zapisaną odpowiedź Overpass
"""
import heapq
import json
import math
import os
import sys
import urllib.parse
import urllib.request

QUERY = ('[out:json][timeout:60];relation["enforcement"="average_speed"](area:3600049715);'
         'out body;>;out body qt;')
URL = 'https://overpass-api.de/api/interpreter'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'odcinki-osm.json')
HEADING_DISTANCE_M = 80


def download():
    request = urllib.request.Request(
        URL, urllib.parse.urlencode({'data': QUERY}).encode(),
        {'User-Agent': 'odcinkowy-data-script/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def distance(a, b):
    x = math.radians(b['lon'] - a['lon']) * math.cos(math.radians((a['lat'] + b['lat']) / 2))
    y = math.radians(b['lat'] - a['lat'])
    return math.hypot(x, y) * 6371000


def bearing(a, b):
    x = math.radians(b['lon'] - a['lon']) * math.cos(math.radians((a['lat'] + b['lat']) / 2))
    y = math.radians(b['lat'] - a['lat'])
    return round(math.degrees(math.atan2(x, y))) % 360


def shortest_path(ways, nodes, start, end):
    """Najkrótsza droga po liniach odcinka — daje długość i kierunek jazdy."""
    graph = {}
    for way in ways:
        for a, b in zip(way['nodes'], way['nodes'][1:]):
            d = distance(nodes[a], nodes[b])
            graph.setdefault(a, []).append((b, d))
            graph.setdefault(b, []).append((a, d))
    queue = [(0, start, [start])]
    seen = set()
    while queue:
        length, node, path = heapq.heappop(queue)
        if node == end:
            return length, path
        if node in seen:
            continue
        seen.add(node)
        for neighbour, d in graph.get(node, []):
            if neighbour not in seen:
                heapq.heappush(queue, (length + d, neighbour, path + [neighbour]))
    return None, None


def far_point(path, nodes):
    for node in path[1:]:
        if distance(nodes[path[0]], nodes[node]) >= HEADING_DISTANCE_M:
            return nodes[node]
    return nodes[path[-1]]


def convert(data):
    elements = data['elements']
    nodes = {e['id']: e for e in elements if e['type'] == 'node'}
    ways = {e['id']: e for e in elements if e['type'] == 'way'}
    sections = []
    for relation in sorted((e for e in elements if e['type'] == 'relation'), key=lambda e: e['id']):
        tags = relation.get('tags', {})
        members = relation['members']
        ends = {m['role']: m['ref'] for m in members
                if m['type'] == 'node' and m['role'] in ('from', 'to') and m['ref'] in nodes}
        if len(ends) != 2:
            print('pominięto (brak początku lub końca):', relation['id'])
            continue
        start, end = nodes[ends['from']], nodes[ends['to']]
        section_ways = [ways[m['ref']] for m in members
                        if m['type'] == 'way' and m['role'] == 'section' and m['ref'] in ways]
        length, path = shortest_path(section_ways, nodes, ends['from'], ends['to'])
        if path:
            start_heading = bearing(start, far_point(path, nodes))
            end_heading = bearing(far_point(path[::-1], nodes), end)
        else:
            length = None
            start_heading = end_heading = bearing(start, end)
        roads = [w.get('tags', {}).get('ref') or w.get('tags', {}).get('name') for w in section_ways]
        roads = [r for r in roads if r]
        road = max(set(roads), key=roads.count) if roads else ''
        limit = tags.get('maxspeed', '')
        sections.append({
            'id': 'osm-%d' % relation['id'],
            'name': ' · '.join(x for x in (road, tags.get('ref')) if x) or 'Odcinek',
            'limit': int(limit) if limit.isdigit() else None,
            'lengthM': round(length) if length else None,
            'start': {'lat': start['lat'], 'lon': start['lon'], 'heading': start_heading},
            'end': {'lat': end['lat'], 'lon': end['lon'], 'heading': end_heading},
        })
    return sections


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = download()
    sections = convert(data)
    if not sections:
        sys.exit('Brak danych — plik pozostaje bez zmian.')
    header = {
        'source': 'OpenStreetMap',
        'license': 'ODbL 1.0, © autorzy OpenStreetMap',
        'updated': data['osm3s']['timestamp_osm_base'][:10],
    }
    # Jeden odcinek w wierszu — czytelne zmiany w historii repozytorium
    rows = ',\n'.join(json.dumps(s, ensure_ascii=False, separators=(',', ':')) for s in sections)
    text = json.dumps(header, ensure_ascii=False)[:-1] + ',\n"sections": [\n' + rows + '\n]}\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(text)
    print('zapisano', len(sections), 'odcinków;', sum(s['lengthM'] is None for s in sections), 'bez długości')


if __name__ == '__main__':
    main()
