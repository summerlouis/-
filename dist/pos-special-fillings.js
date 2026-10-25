(() => {
  const special = {
    A1: [['韭菜鸡蛋', 'Poireau et œuf']],
    A2: [['猪肉白菜', 'Porc et chou'], ['鲜肉', 'Porc'], ['韭菜猪肉', 'Porc et poireau']],
    A3: [['红油牛肉包', 'Bao au bœuf pimenté'], ['牛肉鲜肉包', 'Bao au bœuf frais']]
  };
  const original = {
    A1: [['韭菜鸡蛋', 'Poireau et œuf']],
    A2: [['韭菜鸡蛋', 'Poireau et œuf'], ['鲜肉', 'Porc'], ['牛肉', 'Bœuf']],
    A3: [['韭菜鸡蛋', 'Poireau et œuf'], ['鲜肉', 'Porc']]
  };
  const orderKey = 'baoDumplingOrders';
  const dialog = document.querySelector('#pos-choice');
  const step = document.querySelector('#pos-step');
  const optionBox = document.querySelector('#pos-options');
  const cartBox = document.querySelector('#pos-cart');
  const input = document.querySelector('#code-input');
  let service = '堂食';

  document.querySelectorAll('[data-pos-service]').forEach(button => {
    button.onclick = () => {
      service = button.dataset.posService;
      document.querySelectorAll('[data-pos-service]').forEach(item => item.classList.toggle('selected', item === button));
    };
  });

  const currentCode = () => (document.querySelector('#pos-product')?.textContent || '').split(' · ')[0].trim();
  const replaceText = (text, code) => {
    const before = original[code] || [], after = special[code] || [];
    return before.reduce((value, item, index) => after[index] ? value.replace(`${item[0]} / ${item[1]}`, `${after[index][0]} / ${after[index][1]}`) : value, text);
  };
  const decorateCart = () => cartBox.querySelectorAll('.cart-row').forEach(row => {
    const code = row.querySelector('b')?.textContent?.trim();
    const detail = row.querySelector('small');
    if (detail && special[code]) {
      const updated = replaceText(detail.innerHTML, code);
      if (detail.innerHTML !== updated) detail.innerHTML = updated;
    }
  });
  const decorateFillingChoices = () => {
    if (!step.textContent.includes('步骤 1')) return;
    const code = currentCode();
    if (!special[code]) return;
    [...optionBox.querySelectorAll('button')].forEach((button, index) => {
      const item = special[code][index];
      button.hidden = !item;
      if (item && button.textContent.trim() !== `${item[0]}${item[1]}`) button.innerHTML = `${item[0]}<small style="display:block;font-weight:400">${item[1]}</small>`;
    });
  };
  new MutationObserver(() => {
    decorateFillingChoices();
    decorateCart();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('bao-pos-order', event => {
    const order=event.detail;
    order.service=service;
    (order.items||[]).forEach(item=>{
      const before=original[item.code]||[], after=special[item.code]||[];
      const index=before.findIndex(entry=>entry[0]===item.filling&&entry[1]===item.fillingFr);
      if(index>=0&&after[index])[item.filling,item.fillingFr]=after[index];
    });
  });
})();
