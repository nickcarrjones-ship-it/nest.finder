import sys

def modify_map_html():
    path = '/Users/nick/nest.finder/map.html'
    with open(path, 'r') as f:
        lines = f.readlines()

    new_lines = []
    skip = False
    in_setup_dropdowns = False
    in_populate_commute = False
    in_toggle_journey = False
    in_dom_content = False
    dom_content_braces = 0

    for i, line in enumerate(lines):
        # Remove setup-overlay HTML block (lines 37-124 previously)
        if 'id="setup-overlay"' in line and 'display:none' in line and '<div' in line:
            skip = True
            
        if skip:
            if '</div>' in line and '<!-- /setup-overlay' not in line:
                # We know the overlay ends before the header. Look for </header> or HEADER comment.
                pass
            if 'HEADER' in line and '════════════════════════════' in line:
                skip = False
                new_lines.append(line)
            continue
            
        if 'onclick="openSetup()"' in line:
            line = line.replace('onclick="openSetup()"', 'onclick="window.location.href=\'setup.html?edit=true\'"')

        # Remove redundant setup JS
        if 'function populateSetupDropdowns()' in line:
            in_setup_dropdowns = True
            
        if in_setup_dropdowns:
            if line.strip() == '}':
                in_setup_dropdowns = False
            continue

        if 'function populateSetupCommuteSelects()' in line:
            in_populate_commute = True
            
        if in_populate_commute:
            if line.strip() == '}':
                in_populate_commute = False
            continue

        if 'function toggleIndividualJourney()' in line:
            in_toggle_journey = True
            
        if in_toggle_journey:
            if line.strip() == '}':
                in_toggle_journey = False
            continue

        # We need to replace the DOMContentLoaded listener that checks if profile exists
        if "if (!ProfileManager.load()) {" in line and "setup-overlay" in lines[i+4]:
            # This is too fragile to parse line by line perfectly, let's just use exact substitution for this block.
            pass

        new_lines.append(line)

    with open(path, 'w') as f:
        f.writelines(new_lines)


def modify_map_js():
    path = '/Users/nick/nest.finder/js/map.js'
    with open(path, 'r') as f:
        content = f.read()

    # We know the exact start and end strings based on the previous view_file
    start_str = "// ── Gym picker (setup overlay) ────────────────────────────────"
    end_str = "window.saveSetup = saveSetup;"
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)
    
    if start_idx != -1 and end_idx != -1:
        end_idx += len(end_str)
        # also remove trailing newlines
        while end_idx < len(content) and content[end_idx] in ['\n', '\r']:
            end_idx += 1
        new_content = content[:start_idx] + content[end_idx:]
        with open(path, 'w') as f:
            f.write(new_content)
            
if __name__ == '__main__':
    modify_map_js()
