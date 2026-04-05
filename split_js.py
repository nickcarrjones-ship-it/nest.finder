import re

def split_map_js():
    path = '/Users/nick/nest.finder/js/map.js'
    with open(path, 'r') as f:
        lines = f.readlines()
        
    core_out = []
    data_out = []
    ui_out = []
    
    current_out = core_out # default
    
    # Map section titles to output lists
    section_map = {
        'Module-level state': core_out,
        'GYM BRANDS data': data_out,
        'Council Tax 2024/25 — Band D annual (London boroughs)': data_out,
        'Load data then initialise': data_out,
        'Map initialisation': core_out,
        'Circle radius — scales with zoom': core_out,
        'Apply stored profile to all UI elements': ui_out,
        'Compute overlap zones': core_out,
        'Popup button handlers (global for inline onclick)': ui_out,
        'Area info panel': ui_out,
        'Council Tax display': ui_out,
        'Property search links': ui_out,
        'Third Space': ui_out,
        'Score buttons': ui_out,
        'Save / load ratings': ui_out,
        'Top-5 cache': ui_out,
        'Veto logic': ui_out,
        'Tab switching': ui_out,
        'Results dashboard': ui_out,
        'All Areas table': ui_out,
        'Bills': ui_out,
        'Gym toggles (search tab)': ui_out,
        'Claude API: lifestyle': data_out,
        'Firebase init (called from auth.js when user logs in)': core_out,
        'Boot': core_out
    }

    for line in lines:
        m = re.match(r'^// ── (.*?) ─+$', line)
        if m:
            title_part = m.group(1).strip()
            # print("Found section:", title_part)
            
            # Identify which output list it belongs to
            found = False
            for k, out_list in section_map.items():
                if title_part.startswith(k):
                    current_out = out_list
                    found = True
                    break
            
            if not found:
                pass # keep current_out
                
        current_out.append(line)
        
    # Write files out
    with open('/Users/nick/nest.finder/js/map-core.js', 'w') as f:
        f.writelines(core_out)
    with open('/Users/nick/nest.finder/js/map-data.js', 'w') as f:
        f.writelines(data_out)
    with open('/Users/nick/nest.finder/js/map-ui.js', 'w') as f:
        f.writelines(ui_out)
        
def update_map_html():
    path = '/Users/nick/nest.finder/map.html'
    with open(path, 'r') as f:
        html = f.read()
        
    # replace <script src="js/map.js"></script> with the three new ones
    old_script = '<script src="js/map.js"></script>'
    new_scripts = '''<!-- Split Map JS Modules -->
<script src="js/map-core.js"></script>
<script src="js/map-data.js"></script>
<script src="js/map-ui.js"></script>'''

    html = html.replace(old_script, new_scripts)
    
    with open(path, 'w') as f:
        f.write(html)
        
if __name__ == '__main__':
    split_map_js()
    update_map_html()
