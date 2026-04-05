import re

def refactor_html():
    path = '/Users/nick/nest.finder/map.html'
    with open(path, 'r') as f:
        html = f.read()

    # 1. Remove the entire #setup-overlay div
    # It starts with `<div id="setup-overlay"`
    # and ends with `</div>` but it has nested divs.
    # It's better to regex replace the exact block from line 37-123. 
    # Let's find index.
    start_token = '<div id="setup-overlay"'
    start_idx = html.find(start_token)
    
    # We know the overlay ends right before: <!-- ═══════════════════════════════════════════════════════════
    #      HEADER
    #      ═══════════════════════════════════════════════════════════ -->
    end_token = '<!-- ═══════════════════════════════════════════════════════════\n     HEADER'
    end_idx = html.find(end_token)
    
    if start_idx != -1 and end_idx != -1:
        html = html[:start_idx] + html[end_idx:]

    # 2. Replace the window.location for DOMContentLoaded
    # Find:
    #   document.addEventListener('DOMContentLoaded', function() {
    #     if (!ProfileManager.load()) {
    #       // No profile saved — show the setup overlay inline
    #       // (the map still loads in background for speed)
    #       document.getElementById('setup-overlay').style.display = 'flex';
    #       // Populate dropdowns
    #       populateSetupDropdowns();
    #       buildGymPicker('gym-picker-p1', 'p1');
    #       buildGymPicker('gym-picker-p2', 'p2');
    #     }
    #   });
    #
    # Replace with: window.location.href = 'setup.html';
    
    old_listener = """  document.addEventListener('DOMContentLoaded', function() {
    if (!ProfileManager.load()) {
      // No profile saved — show the setup overlay inline
      // (the map still loads in background for speed)
      document.getElementById('setup-overlay').style.display = 'flex';
      // Populate dropdowns
      populateSetupDropdowns();
      buildGymPicker('gym-picker-p1', 'p1');
      buildGymPicker('gym-picker-p2', 'p2');
    }
  });"""
  
    new_listener = """  document.addEventListener('DOMContentLoaded', function() {
    if (!ProfileManager.load()) {
      window.location.href = 'setup.html';
    }
  });"""

    if old_listener in html:
        html = html.replace(old_listener, new_listener)

    # 3. Remove populateSetupCommuteSelects:
    # function populateSetupCommuteSelects() { ... }
    # Search for start and find next function
    r_commute = re.compile(r'  function populateSetupCommuteSelects\(\) \{[\s\S]*?  \}', re.MULTILINE)
    html = r_commute.sub('', html)

    # 4. Remove toggleIndividualJourney:
    r_toggle = re.compile(r'  function toggleIndividualJourney\(\) \{[\s\S]*?  \}', re.MULTILINE)
    html = r_toggle.sub('', html)

    # 5. Remove populateSetupDropdowns:
    r_dropdowns = re.compile(r'  // ── Populate setup overlay dropdowns ──────────────────────[\s\S]*?  function populateSetupDropdowns\(\) \{[\s\S]*?  \}', re.MULTILINE)
    html = r_dropdowns.sub('', html)

    # 6. Change onclick="openSetup()" to location replace
    html = html.replace('onclick="openSetup()"', 'onclick="window.location.href=\'setup.html?edit=true\'"')

    # 7. In DOMContentLoaded the second one, there is:
    #     if (typeof toggleIndividualJourney === 'function') toggleIndividualJourney();
    # we can remove that line if it's there
    html = html.replace("if (typeof toggleIndividualJourney === 'function') toggleIndividualJourney();", "")

    with open(path, 'w') as f:
        f.write(html)

if __name__ == '__main__':
    refactor_html()
