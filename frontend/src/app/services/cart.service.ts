import { Injectable, signal, computed } from '@angular/core';
import { Equipment } from '../models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private _items = signal<Equipment[]>([]);

  items = this._items.asReadonly();
  count = computed(() => this._items().length);

  add(item: Equipment) {
    if (!this._items().find(i => i.id === item.id)) {
      this._items.update(list => [...list, item]);
    }
  }

  remove(id: number) {
    this._items.update(list => list.filter(i => i.id !== id));
  }

  has(id: number) {
    return this._items().some(i => i.id === id);
  }

  clear() {
    this._items.set([]);
  }
}
