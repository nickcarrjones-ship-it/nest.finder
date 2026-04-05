import re

def update_lazy_loading():
    path = '/Users/nick/nest.finder/map.html'
    with open(path, 'r') as f:
        html = f.read()

    old_toggle = """  // Placeholder layer toggle (to be expanded later)
  function toggleLayer(name) {
    var el = document.getElementById('lt-' + name);
    if (el) el.classList.toggle('on');
  }"""

    new_toggle_logic = """  // Lazy loading Map layers
  window.mapLayers = {};
  window.layerDataLoaded = {};

  function toggleLayer(name) {
    if (!window.mapLayers[name]) {
      window.mapLayers[name] = (name === 'schools') ? L.markerClusterGroup() : L.layerGroup();
    }

    var el = document.getElementById('lt-' + name);
    if (!el) return;
    var isOn = el.classList.toggle('on');
    
    // Safety check if map exists yet
    if (!window.map) return;
    
    if (isOn) {
      if (!window.layerDataLoaded[name]) {
        console.log('[Lazy Load] Fetching data for ' + name + ' layer...');
        // In a real implementation, call fetch() to load GeoJSON or Firebase queries
        setTimeout(function() {
          console.log('[Lazy Load] Data loaded for ' + name);
          window.layerDataLoaded[name] = true;
          window.map.addLayer(window.mapLayers[name]);
        }, 500);
      } else {
        window.map.addLayer(window.mapLayers[name]);
      }
    } else {
      window.map.removeLayer(window.mapLayers[name]);
    }
  }"""
  
    if old_toggle in html:
        html = html.replace(old_toggle, new_toggle_logic)
        
    with open(path, 'w') as f:
        f.write(html)
        
if __name__ == '__main__':
    update_lazy_loading()
